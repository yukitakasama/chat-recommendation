import * as Dialog from '@radix-ui/react-dialog'
import * as Switch from '@radix-ui/react-switch'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import clsx from 'clsx'
import { AlertTriangle, Check, LoaderCircle, X } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'icon'
}): React.JSX.Element {
  return (
    <button
      className={clsx('button', `button--${variant}`, `button--${size}`, className)}
      {...props}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  children,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }): React.JSX.Element {
  return (
    <Tooltip.Provider delayDuration={450}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button className={clsx('icon-button', className)} aria-label={label} {...props}>
            {children}
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip" sideOffset={6}>
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return <input className={clsx('input', className)} {...props} />
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  return <textarea className={clsx('textarea', className)} {...props} />
}

export function Field({
  label,
  hint,
  error,
  children
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint && !error ? <span className="field__hint">{hint}</span> : null}
      {error ? <span className="field__error">{error}</span> : null}
    </label>
  )
}

export function SwitchField({
  checked,
  onCheckedChange,
  label,
  description,
  disabled
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}): React.JSX.Element {
  return (
    <label className={clsx('switch-row', disabled && 'is-disabled')}>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <Switch.Root
        className="switch"
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      >
        <Switch.Thumb className="switch__thumb" />
      </Switch.Root>
    </label>
  )
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = '560px',
  footer
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  width?: string
  footer?: ReactNode
}): React.JSX.Element {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal" style={{ maxWidth: width }}>
          <div className="modal__header">
            <div>
              <Dialog.Title className="modal__title">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="modal__description">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="关闭">
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          <div className="modal__body">{children}</div>
          {footer ? <div className="modal__footer">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = '确认',
  danger,
  onConfirm
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmText?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}): React.JSX.Element {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      width="460px"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={async () => {
              await onConfirm()
              onOpenChange(false)
            }}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      <div className={clsx('notice', danger && 'notice--danger')}>
        {danger ? <AlertTriangle size={18} /> : <Check size={18} />}
        <p>{description}</p>
      </div>
    </Modal>
  )
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string
  description?: string
  actions?: ReactNode
}): React.JSX.Element {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description: string
  action?: ReactNode
}): React.JSX.Element {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  )
}

export function Spinner({ label = '处理中' }: { label?: string }): React.JSX.Element {
  return (
    <span className="spinner">
      <LoaderCircle size={16} />
      {label}
    </span>
  )
}

export function TabsRoot({
  value,
  onValueChange,
  children
}: {
  value: string
  onValueChange: (value: string) => void
  children: ReactNode
}): React.JSX.Element {
  return (
    <Tabs.Root value={value} onValueChange={onValueChange}>
      {children}
    </Tabs.Root>
  )
}

export const TabsList = Tabs.List
export const TabsTrigger = Tabs.Trigger
export const TabsContent = Tabs.Content
