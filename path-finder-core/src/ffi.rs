use std::ffi::{CStr, CString, c_char};
use std::ptr;

use crate::config::Config;
use crate::pipeline::run_pipeline;
use crate::shape;

/// Run the pipeline from C/Go.
///
/// `parser_id` is the identifier to assign to the resulting manifest.
/// `pages_json` is a JSON array of `[url, html]` pairs.
/// `config_json` is a JSON object matching the Config struct.
///
/// Returns a heap-allocated JSON string (caller must free with `pfr_free`),
/// or null on error (error message retrievable via `pfr_last_error`).
#[unsafe(no_mangle)]
pub extern "C" fn pfr_run(
    parser_id: *const c_char,
    pages_json: *const c_char,
    config_json: *const c_char,
) -> *mut c_char {
    let result = std::panic::catch_unwind(|| {
        let parser_id_str = unsafe { CStr::from_ptr(parser_id) }
            .to_str()
            .map_err(|e| format!("invalid parser_id UTF-8: {e}"))?
            .to_string();
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

        let manifest = run_pipeline(pages_raw, parser_id_str, &config)
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

/// Compute the structural shape of a page and return it as JSON:
/// `{"paths": [...], "marks": [...], "id": "a1b2c3d4"}`.
///
/// - `paths`: depth-capped root-to-node tag paths.
/// - `marks`: stable identifiers — `#id` values, `role=...`, `aria-*=...`,
///   and "stable-looking" classes (CSS-in-JS hashes filtered out).
/// - `id`: 8-char FNV-1a of the sorted path set, suitable as the tail of a
///   bucket ID (`<host>:<id>`).
///
/// Caller must free with `pfr_free`. Returns null on error.
#[unsafe(no_mangle)]
pub extern "C" fn pfr_shape(html: *const c_char) -> *mut c_char {
    let result = std::panic::catch_unwind(|| {
        let html_str = unsafe { CStr::from_ptr(html) }
            .to_str()
            .map_err(|e| format!("invalid html UTF-8: {e}"))?;
        let s = shape::compute(html_str);
        serde_json::to_string(&s).map_err(|e| format!("serialization error: {e}"))
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
            set_last_error("shape panicked".to_string());
            ptr::null_mut()
        }
    }
}

/// Jaccard similarity between two shape path sets. Inputs are JSON arrays of
/// strings (the `paths` field of a `pfr_shape` result). Returns the score in
/// [0.0, 1.0], or a negative value on input/parse error (check
/// `pfr_last_error`).
#[unsafe(no_mangle)]
pub extern "C" fn pfr_shape_jaccard(a_json: *const c_char, b_json: *const c_char) -> f64 {
    let result = std::panic::catch_unwind(|| {
        let a_str = unsafe { CStr::from_ptr(a_json) }
            .to_str()
            .map_err(|e| format!("invalid a UTF-8: {e}"))?;
        let b_str = unsafe { CStr::from_ptr(b_json) }
            .to_str()
            .map_err(|e| format!("invalid b UTF-8: {e}"))?;
        let a: Vec<String> = serde_json::from_str(a_str)
            .map_err(|e| format!("a JSON parse error: {e}"))?;
        let b: Vec<String> = serde_json::from_str(b_str)
            .map_err(|e| format!("b JSON parse error: {e}"))?;
        Ok::<f64, String>(shape::jaccard(&a, &b))
    });

    match result {
        Ok(Ok(score)) => score,
        Ok(Err(e)) => {
            set_last_error(e);
            -1.0
        }
        Err(_) => {
            set_last_error("shape_jaccard panicked".to_string());
            -1.0
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
