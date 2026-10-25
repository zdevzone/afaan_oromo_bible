use std::io;
use std::path::Path;

/// Atomically publish a fully written sibling temporary file at `destination`.
///
/// The caller must create and sync the temporary file in the destination
/// directory first. If replacement fails, the existing destination remains.
pub(crate) fn replace_file(temporary: &Path, destination: &Path) -> io::Result<()> {
    #[cfg(windows)]
    {
        use std::{ffi::OsStr, iter, os::windows::ffi::OsStrExt};

        #[link(name = "Kernel32")]
        unsafe extern "system" {
            fn MoveFileExW(existing: *const u16, replacement: *const u16, flags: u32) -> i32;
        }

        const MOVEFILE_REPLACE_EXISTING: u32 = 0x1;
        const MOVEFILE_WRITE_THROUGH: u32 = 0x8;

        fn wide_null_terminated(path: &OsStr) -> Vec<u16> {
            path.encode_wide().chain(iter::once(0)).collect()
        }

        let temporary = wide_null_terminated(temporary.as_os_str());
        let destination = wide_null_terminated(destination.as_os_str());
        // SAFETY: both pointers refer to live, NUL-terminated UTF-16 buffers;
        // the API does not retain either pointer after returning.
        let succeeded = unsafe {
            MoveFileExW(
                temporary.as_ptr(),
                destination.as_ptr(),
                MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
            )
        };
        if succeeded == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }

    #[cfg(not(windows))]
    {
        std::fs::rename(temporary, destination)
    }
}

#[cfg(test)]
mod tests {
    use std::{fs, path::PathBuf};

    fn temp_dir() -> PathBuf {
        std::env::temp_dir().join(format!("aob-atomic-replace-{}", uuid::Uuid::new_v4()))
    }

    #[test]
    fn replaces_an_existing_file_with_the_complete_temporary_file() {
        let directory = temp_dir();
        fs::create_dir(&directory).unwrap();
        let temporary = directory.join("new.tmp");
        let destination = directory.join("backup.json");
        fs::write(&temporary, b"complete new backup").unwrap();
        fs::write(&destination, b"previous backup").unwrap();

        super::replace_file(&temporary, &destination).unwrap();

        assert_eq!(fs::read(&destination).unwrap(), b"complete new backup");
        assert!(!temporary.exists());
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn a_failed_replace_preserves_the_existing_file() {
        let directory = temp_dir();
        fs::create_dir(&directory).unwrap();
        let temporary = directory.join("missing.tmp");
        let destination = directory.join("backup.json");
        fs::write(&destination, b"previous backup").unwrap();

        assert!(super::replace_file(&temporary, &destination).is_err());

        assert_eq!(fs::read(&destination).unwrap(), b"previous backup");
        fs::remove_dir_all(directory).unwrap();
    }
}
