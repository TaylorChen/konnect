/// Debug logging macro - only outputs in debug builds
/// In release builds, the condition is evaluated at compile time and the code is optimized away
#[macro_export]
macro_rules! debug_log {
    ($($arg:tt)*) => {
        if cfg!(debug_assertions) {
            println!($($arg)*)
        }
    };
}

