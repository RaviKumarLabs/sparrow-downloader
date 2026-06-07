/// Windows process-creation flag that prevents a console window from being
/// shown when a child process is spawned.  Value from the Win32 SDK header
/// `processthreadsapi.h`.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Extension trait that adds a `.no_window()` builder method to both
/// `tokio::process::Command` and `std::process::Command`.
///
/// On Windows this sets `CREATE_NO_WINDOW` via the `CommandExt` trait from
/// `std::os::windows::process`.  On all other platforms the method compiles
/// to an inlined no-op, so call sites need no `#[cfg]` guards.
pub trait NoWindowExt {
    fn no_window(&mut self) -> &mut Self;
}

impl NoWindowExt for tokio::process::Command {
    #[inline]
    fn no_window(&mut self) -> &mut Self {
        // tokio::process::Command exposes creation_flags as an inherent method
        // on Windows — no trait import required.
        #[cfg(target_os = "windows")]
        self.creation_flags(CREATE_NO_WINDOW);
        self
    }
}

impl NoWindowExt for std::process::Command {
    #[inline]
    fn no_window(&mut self) -> &mut Self {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            self.creation_flags(CREATE_NO_WINDOW);
        }
        self
    }
}
