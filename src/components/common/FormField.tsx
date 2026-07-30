import React, { useId } from 'react';

type BaseProps = {
  label: string;
  helpText?: string;
  error?: string;
  required?: boolean;
  containerClassName?: string;
};

type InputFieldProps = BaseProps & { as?: 'input' } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'>;
type TextareaFieldProps = BaseProps & { as: 'textarea' } & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;
type SelectFieldProps = BaseProps & { as: 'select'; children: React.ReactNode } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'className'>;

export type FormFieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

export const FormField: React.FC<FormFieldProps> = (props) => {
  const { label, helpText, error, required, containerClassName, id: idProp, as, children, ...rest } = props as BaseProps &
    Record<string, any>;

  const generatedId = useId();
  const id = idProp || generatedId;
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, helpText ? helpId : null].filter(Boolean).join(' ') || undefined;

  const fieldClasses = `w-full bg-creator-canvas border rounded-creator-control px-3.5 py-2.5 text-creator-body text-creator-ink placeholder:text-creator-ink-faint transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-creator-brand/40 disabled:opacity-50 disabled:cursor-not-allowed ${
    error ? 'border-creator-danger focus-visible:ring-creator-danger/40' : 'border-creator-border focus:border-creator-brand'
  }`;

  return (
    <div className={containerClassName}>
      <label htmlFor={id} className="block text-creator-caption font-semibold text-creator-ink-muted mb-1.5">
        {label}
        {required && (
          <span className="text-creator-danger ml-0.5" aria-hidden="true">
            *
          </span>
        )}
      </label>

      {as === 'textarea' ? (
        <textarea
          id={id}
          required={required}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`${fieldClasses} min-h-24 resize-y`}
          {...rest}
        />
      ) : as === 'select' ? (
        <select id={id} required={required} aria-invalid={!!error} aria-describedby={describedBy} className={fieldClasses} {...rest}>
          {children}
        </select>
      ) : (
        <input id={id} required={required} aria-invalid={!!error} aria-describedby={describedBy} className={fieldClasses} {...rest} />
      )}

      {error ? (
        <p id={errorId} className="text-creator-caption text-creator-danger mt-1.5">
          {error}
        </p>
      ) : helpText ? (
        <p id={helpId} className="text-creator-caption text-creator-ink-faint mt-1.5">
          {helpText}
        </p>
      ) : null}
    </div>
  );
};
