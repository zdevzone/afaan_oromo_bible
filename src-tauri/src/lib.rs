pub mod storage;

#[cfg(feature = "desktop")]
mod desktop {
    use super::storage::{
        AppError, BookSummary, ChapterContent, ChapterKey, Edition, Note, Preferences,
        ReadingPosition, Repository, SearchRequest, SearchResults,
    };
    use std::{
        path::PathBuf,
        sync::{Arc, Mutex},
    };
    use tauri::{Manager, State};

    // The mutex serializes a small pair of owned SQLite connections. All database
    // work, including first-open/fixture preparation, runs on blocking workers.
    #[derive(Clone)]
    struct NativeState {
        directory: PathBuf,
        repository: Arc<Mutex<Option<Repository>>>,
    }

    async fn with_store<T, F>(state: NativeState, operation: F) -> Result<T, AppError>
    where
        T: Send + 'static,
        F: FnOnce(&mut Repository) -> Result<T, AppError> + Send + 'static,
    {
        tauri::async_runtime::spawn_blocking(move || {
            let mut guard = state.repository.lock().map_err(|_| {
                AppError::new(
                    "WRITE_FAILED",
                    "Storage is unavailable. Restart the application and retry.",
                )
            })?;
            if guard.is_none() {
                *guard = Some(Repository::open(&state.directory)?);
            }
            match guard.as_mut() {
                Some(repository) => operation(repository),
                None => Err(AppError::new(
                    "WRITE_FAILED",
                    "Storage could not be initialized.",
                )),
            }
        })
        .await
        .map_err(|_| {
            AppError::new(
                "WRITE_FAILED",
                "A storage operation failed. Your draft remains unsaved.",
            )
        })?
    }

    #[tauri::command]
    async fn library_list_editions(
        state: State<'_, NativeState>,
    ) -> Result<Vec<Edition>, AppError> {
        with_store(state.inner().clone(), |store| store.list_editions()).await
    }

    #[tauri::command]
    async fn library_list_books(
        edition_id: String,
        state: State<'_, NativeState>,
    ) -> Result<Vec<BookSummary>, AppError> {
        with_store(state.inner().clone(), move |store| {
            store.list_books(&edition_id)
        })
        .await
    }

    #[tauri::command]
    async fn library_get_chapter(
        key: ChapterKey,
        state: State<'_, NativeState>,
    ) -> Result<ChapterContent, AppError> {
        with_store(state.inner().clone(), move |store| store.get_chapter(&key)).await
    }

    #[tauri::command]
    async fn library_search(
        request: SearchRequest,
        state: State<'_, NativeState>,
    ) -> Result<SearchResults, AppError> {
        with_store(state.inner().clone(), move |store| store.search(&request)).await
    }

    #[tauri::command]
    async fn user_list_notes(state: State<'_, NativeState>) -> Result<Vec<Note>, AppError> {
        with_store(state.inner().clone(), |store| store.list_notes()).await
    }

    #[tauri::command]
    async fn user_save_note(note: Note, state: State<'_, NativeState>) -> Result<Note, AppError> {
        with_store(state.inner().clone(), move |store| store.save_note(note)).await
    }

    #[tauri::command]
    async fn user_delete_note(id: String, state: State<'_, NativeState>) -> Result<(), AppError> {
        with_store(state.inner().clone(), move |store| store.delete_note(&id)).await
    }

    #[tauri::command]
    async fn user_get_preferences(state: State<'_, NativeState>) -> Result<Preferences, AppError> {
        with_store(state.inner().clone(), |store| store.get_preferences()).await
    }

    #[tauri::command]
    async fn user_save_preferences(
        preferences: Preferences,
        state: State<'_, NativeState>,
    ) -> Result<(), AppError> {
        with_store(state.inner().clone(), move |store| {
            store.save_preferences(&preferences)
        })
        .await
    }

    #[tauri::command]
    async fn user_get_reading_position(
        state: State<'_, NativeState>,
    ) -> Result<Option<ReadingPosition>, AppError> {
        with_store(state.inner().clone(), |store| store.get_reading_position()).await
    }

    #[tauri::command]
    async fn user_save_reading_position(
        position: ReadingPosition,
        state: State<'_, NativeState>,
    ) -> Result<(), AppError> {
        with_store(state.inner().clone(), move |store| {
            store.save_reading_position(&position)
        })
        .await
    }

    pub fn run() {
        tauri::Builder::default()
            .plugin(tauri_plugin_clipboard_manager::init())
            .setup(|app| {
                // Development content never shares a user database with production.
                let directory =
                    app.path()
                        .app_data_dir()?
                        .join(if cfg!(feature = "development-content") {
                            "development"
                        } else {
                            "production"
                        });
                app.manage(NativeState {
                    directory,
                    repository: Arc::new(Mutex::new(None)),
                });
                Ok(())
            })
            .invoke_handler(tauri::generate_handler![
                library_list_editions,
                library_list_books,
                library_get_chapter,
                library_search,
                user_list_notes,
                user_save_note,
                user_delete_note,
                user_get_preferences,
                user_save_preferences,
                user_get_reading_position,
                user_save_reading_position,
            ])
            .run(tauri::generate_context!())
            .expect("The desktop application could not start");
    }
}

#[cfg(feature = "desktop")]
pub use desktop::run;
