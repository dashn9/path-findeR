package core

/*
#cgo LDFLAGS: -L${SRCDIR}/../../../../path-finder-core/target/release -lpath_finder_core -lm -ldl -lpthread
#cgo CFLAGS: -I${SRCDIR}/../../../../path-finder-core/include
#include "path_finder_core.h"
#include <stdlib.h>
*/
import "C"
import (
	"encoding/json"
	"fmt"
	"unsafe"

	"github.com/user/path-finder-service/internal/models"
)

// RunPipeline calls the Rust core via FFI.
// pages is a list of [url, html] pairs. config is the pipeline configuration.
// Returns the raw JSON manifest or an error.
func RunPipeline(pages [][2]string, config models.PipelineConfig) (json.RawMessage, error) {
	pagesJSON, err := json.Marshal(pages)
	if err != nil {
		return nil, fmt.Errorf("marshal pages: %w", err)
	}

	configJSON, err := json.Marshal(config)
	if err != nil {
		return nil, fmt.Errorf("marshal config: %w", err)
	}

	cPages := C.CString(string(pagesJSON))
	defer C.free(unsafe.Pointer(cPages))

	cConfig := C.CString(string(configJSON))
	defer C.free(unsafe.Pointer(cConfig))

	result := C.pfr_run(cPages, cConfig)
	if result == nil {
		errMsg := C.pfr_last_error()
		if errMsg != nil {
			return nil, fmt.Errorf("pipeline: %s", C.GoString(errMsg))
		}
		return nil, fmt.Errorf("pipeline: unknown error")
	}
	defer C.pfr_free(result)

	return json.RawMessage(C.GoString(result)), nil
}
