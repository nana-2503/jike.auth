//go:build !linux && !windows

package handlers

import "fmt"

func getDiskSpace(path string) (total uint64, free uint64, err error) {
	return 0, 0, fmt.Errorf("unsupported platform for disk metrics")
}
