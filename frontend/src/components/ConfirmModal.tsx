import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button } from '@heroui/react'
import { create } from 'zustand'

interface ConfirmState {
  isOpen: boolean
  title: string
  message: string
  confirmText: string
  cancelText: string
  onConfirm: () => void
  onCancel: () => void
}

interface ConfirmStore extends ConfirmState {
  show: (options: { title?: string; message: string; confirmText?: string; cancelText?: string }) => Promise<boolean>
  close: () => void
}

export const useConfirmStore = create<ConfirmStore>((set) => ({
  isOpen: false,
  title: '确认',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  onConfirm: () => {},
  onCancel: () => {},
  show: (options) => {
    return new Promise((resolve) => {
      set({
        isOpen: true,
        title: options.title || '确认',
        message: options.message,
        confirmText: options.confirmText || '确定',
        cancelText: options.cancelText || '取消',
        onConfirm: () => {
          set({ isOpen: false })
          resolve(true)
        },
        onCancel: () => {
          set({ isOpen: false })
          resolve(false)
        },
      })
    })
  },
  close: () => set({ isOpen: false }),
}))

export const confirm = (message: string, title?: string) => {
  return useConfirmStore.getState().show({ message, title })
}

export default function ConfirmModal() {
  const { isOpen, title, message, confirmText, cancelText, onConfirm, onCancel } = useConfirmStore()

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="sm" placement="center">
      <ModalContent>
        <ModalHeader>{title}</ModalHeader>
        <ModalBody>
          <p>{message}</p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onCancel}>{cancelText}</Button>
          <Button color="danger" onPress={onConfirm}>{confirmText}</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
