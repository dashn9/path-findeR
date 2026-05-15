use std::ffi::{CStr, CString, c_char};
use std::ptr;

use crate::config::{Config, Format};
use crate::pipeline::run_pipeline;

/// Run the pipeline from C/Go.
///
/// `pages_json` is a JSON array of `[url, html]` pairs.
/// `config_json` is a JSON object matching the Config struct.
///
/// Returns a heap-allocated JSON string (caller must free with `pfr_free`),
/// or null on error (error message retrievable via `pfr_last_error`).
#[unsafe(no_mangle)]
pub extern "C" fn pfr_run(
    pages_json: *const c_char,
    config_json: *const c_char,
) -> *mut c_char {
    let result = std::panic::catch_unwind(|| {
        let pages_str = unsafe { CStr::from_ptr(pages_json) }
            .to_str()
            .map_err(|e| format!("invalid pages UTF-8: {e}"))?;
        let config_str = unsafe { CStr::from_ptr(config_json) }
            .to_str()
            .map_err(|e| format!("invalid config UTF-8: {e}"))?;

        let pages_raw: Vec<(String, String)> = serde_json::from_str(pages_str)
            .map_err(|e| format!("pages JSON parse error: {e}"))?;

        let config: Config = serde_json::from_str(config_str)
            .map_err(|e| format!("config JSON parse error: {e}"))?;

        let manifest = run_pipeline(pages_raw, &config)
            .map_err(|e| format!("pipeline error: {e}"))?;

        let output = serde_json::to_string(&manifest)
            .map_err(|e| format!("serialization error: {e}"))?;

        Ok::<String, String>(output)
    });

    match result {
        Ok(Ok(json)) => match CString::new(json) {
            Ok(cs) => cs.into_raw(),
            Err(e) => {
                set_last_error(format!("null byte in output: {e}"));
                ptr::null_mut()
            }
        },
        Ok(Err(e)) => {
            set_last_error(e);
            ptr::null_mut()
        }
        Err(_) => {
            set_last_error("pipeline panicked".to_string());
            ptr::null_mut()
        }
    }
}

/// Free a string returned by `pfr_run`.
#[unsafe(no_mangle)]
pub extern "C" fn pfr_free(ptr: *mut c_char) {
    if !ptr.is_null() {
        unsafe { drop(CString::from_raw(ptr)); }
    }
}

/// Get the last error message. Returns null if no error.
/// The returned pointer is valid until the next call to `pfr_run` on the same thread.
#[unsafe(no_mangle)]
pub extern "C" fn pfr_last_error() -> *const c_char {
    LAST_ERROR.with(|e| {
        let borrow = e.borrow();
        match &*borrow {
            Some(cs) => cs.as_ptr(),
            None => ptr::null(),
        }
    })
}

thread_local! {
    static LAST_ERROR: std::cell::RefCell<Option<CString>> = const { std::cell::RefCell::new(None) };
}

fn set_last_error(msg: String) {
    LAST_ERROR.with(|e| {
        *e.borrow_mut() = CString::new(msg).ok();
    });
}
