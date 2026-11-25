import { Modal } from './ui'

export function Confirm({
  open, title, text, onOk, onCancel, okLabel = 'Подтвердить', danger,
}: { open: boolean; title: string; text: string; onOk: () => void; onCancel: () => void; okLabel?: string; danger?: boolean }) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel}>Отмена</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onOk}>{okLabel}</button>
        </>
      }
    >
      <p className="text-sm">{text}</p>
    </Modal>
  )
}
