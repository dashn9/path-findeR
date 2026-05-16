package core

/*
#cgo LDFLAGS: -L${SRCDIR}/../../../../target/release -lpath_finder_core
#cgo linux LDFLAGS: -lm -ldl -lpthread
#cgo darwin LDFLAGS: -lm -ldl -lpthread
#cgo CFLAGS: -I${SRCDIR}/../../../../path-finder-core/include
#include "path_finder_core.h"
#include <stdlib.h>
*/
import "C"
import (
	"encoding/json"
	"fmt"
	"unsafe"

	"github.com/user/path-finder-service/internal/config"
)

// pipelinePayload is the JSON envelope sent over the FFI. Pipeline knobs are
// embedded so they marshal flat; AI config nests under "ai".
type pipelinePayload struct {
	config.PipelineConfig
	AI config.AIConfig `json:"ai"`
}

// RunPipeline calls the Rust core via FFI. Pipeline + AI configs marshal
// straight from their config structs — no parallel DTOs.
func RunPipeline(parserID string, pages [][2]string, pipeline config.PipelineConfig, ai config.AIConfig) (json.RawMessage, error) {
	pagesJSON, err := json.Marshal(pages)
	if err != nil {
		return nil, fmt.Errorf("marshal pages: %w", err)
	}
	configJSON, err := json.Marshal(pipelinePayload{PipelineConfig: pipeline, AI: ai})
	if err != nil {
		return nil, fmt.Errorf("marshal config: %w", err)
	}

	cParserID := C.CString(parserID)
	defer C.free(unsafe.Pointer(cParserID))
	cPages := C.CString(string(pagesJSON))
	defer C.free(unsafe.Pointer(cPages))
	cConfig := C.CString(string(configJSON))
	defer C.free(unsafe.Pointer(cConfig))

	result := C.pfr_run(cParserID, cPages, cConfig)
	if result == nil {
		if msg := C.pfr_last_error(); msg != nil {
			return nil, fmt.Errorf("pipeline: %s", C.GoString(msg))
		}
		return nil, fmt.Errorf("pipeline: unknown error")
	}
	defer C.pfr_free(result)
	return json.RawMessage(C.GoString(result)), nil
}
