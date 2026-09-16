interface Props {
  steps: string[]
  current: number
}

export function Stepper({ steps, current }: Props) {
  return (
    <ol className="stepper">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'active' : 'todo'
        return (
          <li key={label} className={`stepper-item is-${state}`}>
            <span className="stepper-dot">{index + 1}</span>
            <span className="stepper-label">{label}</span>
          </li>
        )
      })}
    </ol>
  )
}
