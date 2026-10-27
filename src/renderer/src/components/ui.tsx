import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, MoreHorizontal, X } from 'lucide-react'
import appIcon from '../assets/app-icon.png'

export function BrandMark({ size = 30 }: { size?: number }): React.JSX.Element {
  return (
    <img
      src={appIcon}
      alt=""
      className="brand-mark"
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}

export function IconButton({
  className = '',
  variant = 'ghost',
  size = 'md',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ghost' | 'soft' | 'plain'
  size?: 'sm' | 'md'
}): React.JSX.Element {
  return (
    <button
      type="button"
      className={`icon-button icon-${size} icon-${variant} ${className}`.trim()}
      {...props}
    />
  )
}

export function Switch({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={`switch ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-thumb" />
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md'
}: {
  value: T
  options: Array<{ value: T; label: string; icon?: ReactNode; count?: number }>
  onChange: (value: T) => void
  size?: 'sm' | 'md'
}): React.JSX.Element {
  return (
    <div className={`segmented segmented-${size}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`segmented-item ${value === option.value ? 'is-active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
          {typeof option.count === 'number' ? <em>{option.count}</em> : null}
        </button>
      ))}
    </div>
  )
}

export function Badge({
  children,
  tone = 'neutral',
  className = ''
}: {
  children: ReactNode
  tone?: 'neutral' | 'jade' | 'coral' | 'amber' | 'red' | 'blue'
  className?: string
}): React.JSX.Element {
  return <span className={`badge badge-${tone} ${className}`.trim()}>{children}</span>
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = '560px',
  bodyClassName = ''
}: {
  title: string
  subtitle?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
  bodyClassName?: string
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal-card"
        style={{ width }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <IconButton onClick={onClose} aria-label="关闭">
            <X size={18} />
          </IconButton>
        </div>
        <div className={`modal-body ${bodyClassName}`.trim()}>{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}

export function EmptyState({
  icon,
  title,
  description,
  actions,
  compact = false
}: {
  icon?: ReactNode
  title: string
  description?: string
  actions?: ReactNode
  compact?: boolean
}): React.JSX.Element {
  return (
    <div className={`empty-state ${compact ? 'is-compact' : ''}`}>
      {icon ? <div className="empty-icon">{icon}</div> : null}
      <div className="empty-title">{title}</div>
      {description ? <div className="empty-description">{description}</div> : null}
      {actions ? <div className="empty-actions">{actions}</div> : null}
    </div>
  )
}

export function Spinner({ size = 16 }: { size?: number }): React.JSX.Element {
  return (
    <span
      className="spinner"
      style={{ width: size, height: size }}
      role="status"
      aria-label="加载中"
    />
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export function Dropdown({
  items,
  trigger,
  align = 'right',
  label = '更多操作'
}: {
  items: MenuItem[]
  trigger?: ReactNode
  align?: 'left' | 'right'
  label?: string
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent): void => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        {trigger ?? <MoreHorizontal size={17} />}
      </button>
      {open ? (
        <div className={`dropdown-menu dropdown-${align}`}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`dropdown-item ${item.danger ? 'is-danger' : ''}`}
              disabled={item.disabled}
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                item.onClick()
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function SelectChevron(): React.JSX.Element {
  return <ChevronDown className="select-chevron" size={14} aria-hidden="true" />
}

export interface ToastItem {
  id: number
  message: string
  tone: 'info' | 'success' | 'error'
}

export function ToastViewport({
  toasts,
  onDismiss
}: {
  toasts: ToastItem[]
  onDismiss: (id: number) => void
}): React.JSX.Element | null {
  if (toasts.length === 0) return null
  return createPortal(
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          className={`toast toast-${toast.tone}`}
          onClick={() => onDismiss(toast.id)}
        >
          <span className="toast-dot" />
          <span>{toast.message}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}

export function FieldLabel({
  children,
  hint
}: {
  children: ReactNode
  hint?: string
}): React.JSX.Element {
  return (
    <div className="field-label">
      <span>{children}</span>
      {hint ? <em>{hint}</em> : null}
    </div>
  )
}

export function SwitchRow({
  title,
  description,
  checked,
  onChange,
  disabled,
  trailing
}: {
  title: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  trailing?: ReactNode
}): React.JSX.Element {
  return (
    <div className={`switch-row ${disabled ? 'is-disabled' : ''}`}>
      <div className="switch-copy">
        <div className="switch-title">
          {title}
          {trailing}
        </div>
        {description ? <div className="switch-description">{description}</div> : null}
      </div>
      <Switch checked={checked} onChange={onChange} disabled={disabled} label={title} />
    </div>
  )
}
