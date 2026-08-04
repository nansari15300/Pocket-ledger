import * as React from 'react';

import {cn} from '@/lib/utils';
import {shouldNormalizeOnTextChange, toFirstLetterCapitalWords} from '@/lib/textAutoCapitalize';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({className, onChange, onBlur, autoCapitalize, disabled, readOnly, ...props}, ref) => {
    const autoCapText = autoCapitalize !== 'off' && autoCapitalize !== 'none' && !disabled && !readOnly;
    const normalizeTarget = (target: HTMLTextAreaElement) => {
      if (!autoCapText) return;
      const next = toFirstLetterCapitalWords(target.value);
      if (next !== target.value) target.value = next;
    };
    return (
      <textarea
        // Textarea width lock: keep form grid stable even with long pasted content.
        className={cn(
          'flex min-h-[80px] w-full min-w-0 max-w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        autoCapitalize={autoCapitalize}
        disabled={disabled}
        readOnly={readOnly}
        {...props}
        onChange={(event) => {
          if (autoCapText && shouldNormalizeOnTextChange(event.currentTarget.value)) {
            normalizeTarget(event.currentTarget);
          }
          onChange?.(event);
        }}
        onBlur={(event) => {
          normalizeTarget(event.currentTarget);
          onBlur?.(event);
        }}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export {Textarea};
