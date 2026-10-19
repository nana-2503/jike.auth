//go:build windows

package handlers

import (
	"path/filepath"
	"syscall"
	"unsafe"
)

var getDiskFreeSpaceExW = syscall.NewLazyDLL("kernel32.dll").NewProc("GetDiskFreeSpaceExW")

func getDiskSpace(path string) (total uint64, free uint64, err error) {
	absPath, err := filepath.Abs(path)
	if err != nil {
		return 0, 0, err
	}
	root := filepath.VolumeName(absPath) + `\`
	rootPtr, err := syscall.UTF16PtrFromString(root)
	if err != nil {
		return 0, 0, err
	}

	var freeBytesAvailableToCaller uint64
	var totalNumberOfBytes uint64
	var totalNumberOfFreeBytes uint64
	r1, _, callErr := getDiskFreeSpaceExW.Call(
		uintptr(unsafe.Pointer(rootPtr)),
		uintptr(unsafe.Pointer(&freeBytesAvailableToCaller)),
		uintptr(unsafe.Pointer(&totalNumberOfBytes)),
		uintptr(unsafe.Pointer(&totalNumberOfFreeBytes)),
	)
	if r1 == 0 {
		if callErr != syscall.Errno(0) {
			return 0, 0, callErr
		}
		return 0, 0, syscall.EINVAL
	}
	return totalNumberOfBytes, freeBytesAvailableToCaller, nil
}
