#[cfg(any(feature = "desktop", test))]
mod atomic_file;
pub mod storage;

#[cfg(feature = "desktop")]
mod desktop {
    use super::storage::{
        archive_corrupt_user_database, AppError, BookSummary, Bookmark, ChapterContent, ChapterKey,
        Edition, Highlight, Note, PersonalSnapshot, Preferences, ReadingPosition, Repository,
        SearchRequest, SearchResults,
    };
    use std::{
        io::{Read, Write},
        path::PathBuf,
        sync::{
            atomic::{AtomicBool, Ordering},
            Arc, Mutex,
        },
    };
    use tauri::{path::BaseDirectory, Emitter, Manager, State};
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};

    // The mutex serializes a small pair of owned SQLite connections. All database
    // work, including first-open/fixture preparation, runs on blocking workers.
    #[derive(Clone)]
    struct NativeState {
        directory: PathBuf,
        packaged_content: Option<PathBuf>,
        technical_review: Option<(PathBuf, String)>,
        repository: Arc<Mutex<Option<Repository>>>,
    }

    #[derive(Default)]
    struct QuitApproval(AtomicBool);

    #[tauri::command]
    fn app_quit_after_decision(app: tauri::AppHandle, approval: State<'_, QuitApproval>) {
        approval.0.store(true, Ordering::SeqCst);
        app.exit(0);
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
                *guard = Some(if let Some((path, hash)) = &state.technical_review {
                    #[cfg(feature = "development-content")]
                    {
                        Repository::open_technical_review(&state.directory, path, hash)?
                    }
                    #[cfg(not(feature = "development-content"))]
                    {
                        let _ = (path, hash);
                        return Err(AppError::new(
                            "CONTENT_UNAVAILABLE",
                            "Technical review is unavailable in public builds.",
                        ));
                    }
                } else {
                    match &state.packaged_content {
                        Some(content) => Repository::open_packaged(&state.directory, content)?,
                        None => Repository::open(&state.directory)?,
                    }
                });
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
    async fn user_recover_corrupt_database(
        confirmed: bool,
        state: State<'_, NativeState>,
    ) -> Result<String, AppError> {
        if !confirmed {
            return Err(AppError::new(
                "INPUT_INVALID",
                "Confirm recovery before creating a fresh personal database.",
            ));
        }
        let state = state.inner().clone();
        tauri::async_runtime::spawn_blocking(move || {
            let guard = state.repository.lock().map_err(|_| {
                AppError::new(
                    "WRITE_FAILED",
                    "Storage is unavailable. Restart the application and retry.",
                )
            })?;
            if guard.is_some() {
                return Err(AppError::new(
                    "STORAGE_INVALID",
                    "Personal storage is already open; recovery was not started.",
                ));
            }
            let location = archive_corrupt_user_database(&state.directory)?;
            Ok(location.to_string_lossy().into_owned())
        })
        .await
        .map_err(|_| AppError::new("WRITE_FAILED", "The recovery action could not complete."))?
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
    async fn user_list_bookmarks(state: State<'_, NativeState>) -> Result<Vec<Bookmark>, AppError> {
        with_store(state.inner().clone(), |store| store.list_bookmarks()).await
    }

    #[tauri::command]
    async fn user_save_bookmark(
        bookmark: Bookmark,
        state: State<'_, NativeState>,
    ) -> Result<Bookmark, AppError> {
        with_store(state.inner().clone(), move |store| {
            store.save_bookmark(bookmark)
        })
        .await
    }

    #[tauri::command]
    async fn user_delete_bookmark(
        id: String,
        state: State<'_, NativeState>,
    ) -> Result<(), AppError> {
        with_store(state.inner().clone(), move |store| {
            store.delete_bookmark(&id)
        })
        .await
    }

    #[tauri::command]
    async fn user_list_highlights(
        state: State<'_, NativeState>,
    ) -> Result<Vec<Highlight>, AppError> {
        with_store(state.inner().clone(), |store| store.list_highlights()).await
    }

    #[tauri::command]
    async fn user_save_highlights(
        highlights: Vec<Highlight>,
        state: State<'_, NativeState>,
    ) -> Result<Vec<Highlight>, AppError> {
        with_store(state.inner().clone(), move |store| {
            store.save_highlights(highlights)
        })
        .await
    }

    #[tauri::command]
    async fn user_delete_highlights(
        ids: Vec<String>,
        state: State<'_, NativeState>,
    ) -> Result<(), AppError> {
        with_store(state.inner().clone(), move |store| {
            store.delete_highlights(ids)
        })
        .await
    }

    #[tauri::command]
    async fn user_read_snapshot(
        state: State<'_, NativeState>,
    ) -> Result<PersonalSnapshot, AppError> {
        with_store(state.inner().clone(), |store| store.read_snapshot()).await
    }

    #[tauri::command]
    async fn user_get_database_id(state: State<'_, NativeState>) -> Result<String, AppError> {
        with_store(state.inner().clone(), |store| store.database_id()).await
    }

    #[tauri::command]
    async fn user_read_recovery_backup(
        state: State<'_, NativeState>,
    ) -> Result<Option<String>, AppError> {
        with_store(state.inner().clone(), |store| store.read_recovery_backup()).await
    }

    #[tauri::command]
    async fn user_replace_snapshot(
        snapshot: PersonalSnapshot,
        created_at: String,
        state: State<'_, NativeState>,
    ) -> Result<String, AppError> {
        with_store(state.inner().clone(), move |store| {
            store.replace_snapshot(snapshot, &created_at)
        })
        .await
    }

    #[tauri::command]
    async fn backup_open_file(app: tauri::AppHandle) -> Result<Option<String>, AppError> {
        tauri::async_runtime::spawn_blocking(move || {
            let selected = app
                .dialog()
                .file()
                .add_filter("User backup", &["json"])
                .blocking_pick_file();
            let Some(selected) = selected else {
                return Ok(None);
            };
            let path = selected.into_path().map_err(|_| {
                AppError::new("BACKUP_INVALID", "The selected backup is not a local file.")
            })?;
            let size = std::fs::metadata(&path)
                .map_err(|_| {
                    AppError::new("BACKUP_INVALID", "The selected backup could not be opened.")
                })?
                .len();
            if size > 50 * 1024 * 1024 {
                return Err(AppError::new(
                    "BACKUP_INVALID",
                    "The selected backup exceeds 50 MiB.",
                ));
            }
            let file = std::fs::File::open(path).map_err(|_| {
                AppError::new("BACKUP_INVALID", "The selected backup could not be opened.")
            })?;
            let mut text = String::new();
            file.take(50 * 1024 * 1024 + 1)
                .read_to_string(&mut text)
                .map_err(|_| {
                    AppError::new(
                        "BACKUP_INVALID",
                        "The selected backup is not readable UTF-8 text.",
                    )
                })?;
            if text.len() > 50 * 1024 * 1024 {
                return Err(AppError::new(
                    "BACKUP_INVALID",
                    "The selected backup exceeds 50 MiB.",
                ));
            }
            Ok(Some(text))
        })
        .await
        .map_err(|_| AppError::new("WRITE_FAILED", "The backup picker could not complete."))?
    }

    #[tauri::command]
    async fn backup_save_file(
        created_at: String,
        state: State<'_, NativeState>,
        app: tauri::AppHandle,
    ) -> Result<Option<String>, AppError> {
        let bytes = with_store(state.inner().clone(), move |store| {
            store.export_backup(&created_at)
        })
        .await?;
        tauri::async_runtime::spawn_blocking(move || {
            let selected = app
                .dialog()
                .file()
                .add_filter("User backup", &["json"])
                .set_file_name("afaan-oromo-bible-backup.json")
                .blocking_save_file();
            let Some(selected) = selected else {
                return Ok(None);
            };
            let path = selected.into_path().map_err(|_| {
                AppError::new(
                    "WRITE_FAILED",
                    "The selected backup location is not a local file.",
                )
            })?;
            if path.exists()
                && !app
                    .dialog()
                    .message("Replace the existing backup file?")
                    .buttons(MessageDialogButtons::OkCancelCustom(
                        "Replace backup".into(),
                        "Cancel".into(),
                    ))
                    .blocking_show()
            {
                return Ok(None);
            }
            let parent = path
                .parent()
                .ok_or_else(|| AppError::new("WRITE_FAILED", "Choose a folder for the backup."))?;
            let temporary = parent.join(format!(".afaan-oromo-bible-{}.tmp", uuid::Uuid::new_v4()));
            let write = (|| -> Result<(), AppError> {
                let mut file = std::fs::OpenOptions::new()
                    .create_new(true)
                    .write(true)
                    .open(&temporary)
                    .map_err(|_| {
                        AppError::new("WRITE_FAILED", "The backup file could not be created.")
                    })?;
                file.write_all(&bytes).map_err(|_| {
                    AppError::new("WRITE_FAILED", "The backup file could not be written.")
                })?;
                file.sync_all().map_err(|_| {
                    AppError::new("WRITE_FAILED", "The backup file could not be made durable.")
                })?;
                drop(file);
                super::atomic_file::replace_file(&temporary, &path).map_err(|_| {
                    AppError::new("WRITE_FAILED", "The backup file could not be completed.")
                })?;
                #[cfg(unix)]
                std::fs::File::open(parent)
                    .and_then(|directory| directory.sync_all())
                    .map_err(|_| {
                        AppError::new(
                            "WRITE_FAILED",
                            "The backup folder could not be made durable.",
                        )
                    })?;
                Ok(())
            })();
            if write.is_err() {
                let _ = std::fs::remove_file(&temporary);
            }
            write?;
            Ok(Some(path.to_string_lossy().into_owned()))
        })
        .await
        .map_err(|_| AppError::new("WRITE_FAILED", "The backup save dialog could not complete."))?
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
        let builder = tauri::Builder::default()
            .plugin(tauri_plugin_clipboard_manager::init())
            .plugin(tauri_plugin_dialog::init());

        #[cfg(feature = "native-webdriver")]
        let builder = builder
            .plugin(tauri_plugin_wdio_webdriver::init())
            .plugin(tauri_plugin_wdio::init());

        builder
            .setup(|app| {
                // Development content never shares a user database with production.
                let technical_review = if cfg!(feature = "development-content") {
                    std::env::var_os("AOB_TECHNICAL_REVIEW_LIBRARY").map(|path| {
                        (
                            PathBuf::from(path),
                            std::env::var("AOB_TECHNICAL_REVIEW_SHA256").unwrap_or_default(),
                        )
                    })
                } else {
                    None
                };
                let directory =
                    app.path()
                        .app_data_dir()?
                        .join(if cfg!(feature = "native-webdriver") {
                            "native-ui-test"
                        } else if cfg!(feature = "development-content") {
                            if technical_review.is_some() {
                                "technical-review"
                            } else {
                                "development"
                            }
                        } else {
                            "production"
                        });
                app.manage(NativeState {
                    directory,
                    technical_review,
                    packaged_content: if cfg!(feature = "development-content") {
                        None
                    } else {
                        Some(app.path().resolve("content", BaseDirectory::Resource)?)
                    },
                    repository: Arc::new(Mutex::new(None)),
                });
                app.manage(QuitApproval::default());
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
                user_list_bookmarks,
                user_save_bookmark,
                user_delete_bookmark,
                user_list_highlights,
                user_save_highlights,
                user_delete_highlights,
                user_read_snapshot,
                user_get_database_id,
                user_read_recovery_backup,
                user_replace_snapshot,
                user_recover_corrupt_database,
                backup_open_file,
                backup_save_file,
                user_get_preferences,
                user_save_preferences,
                user_get_reading_position,
                user_save_reading_position,
                app_quit_after_decision,
            ])
            .build(tauri::generate_context!())
            .expect("The desktop application could not be built")
            .run(|app, event| {
                if let tauri::RunEvent::ExitRequested { api, .. } = event {
                    let approval = app.state::<QuitApproval>();
                    if !approval.0.swap(false, Ordering::SeqCst)
                        && app.get_webview_window("main").is_some()
                    {
                        api.prevent_exit();
                        // A native quit request must pass through the editor's decision flow.
                        // Failure to deliver keeps the application open and preserves the draft.
                        let _ = app.emit("app-quit-requested", ());
                    }
                }
            });
    }
}

#[cfg(feature = "desktop")]
pub use desktop::run;
