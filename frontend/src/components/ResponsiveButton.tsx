import { Button, Tooltip } from '@heroui/react'
import type { ButtonProps } from '@heroui/react'
import type { ReactNode } from 'react'

interface ResponsiveButtonProps extends Omit<ButtonProps, 'children'> {
  icon: ReactNode
  label: string
}

export function RBtn({ icon, label, className, ...props }: ResponsiveButtonProps) {
  const colorClass = props.color ? `rbtn-${props.color}` : 'rbtn-default'

  return (
    <Tooltip content={label}>
      <Button size="sm" isIconOnly {...props} className={`rbtn ${colorClass} min-w-8 w-8 h-8 ${className || ''}`}>
        {icon}
      </Button>
    </Tooltip>
  )
}

export default RBtn
