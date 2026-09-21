import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DateStrip } from './DateStrip.js';

const TODAY = '2026-09-16'; // Wednesday

describe('DateStrip (US-005/AC-02, AC-03, AC-04)', () => {
  it('renders a rolling window of days starting at today (US-005/AC-02)', () => {
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    // 2026-09-16 is a Wednesday; the rolling window is today plus the next six days.
    expect(screen.getByRole('radio', { name: /Wed 16/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Thu 17/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Sat 19/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Sun 20/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tue 22/ })).toBeInTheDocument();
  });

  it('marks the selected date, and only that date, as checked', () => {
    render(<DateStrip today={TODAY} selectedDate="2026-09-18" onSelectDate={() => undefined} />);

    expect(screen.getByRole('radio', { name: /Fri 18/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: /Wed 16/ })).toHaveAttribute('aria-checked', 'false');
  });

  it('marks a weekend as refused, carrying "Closed" as visible text, not merely a dim appearance (US-005/AC-03, US-005/AC-04)', () => {
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    const saturday = screen.getByRole('radio', { name: /Sat 19/ });
    expect(saturday).toHaveTextContent('Closed');
    expect(saturday).toHaveAttribute('aria-disabled', 'true');
  });

  it('marks a date beyond the 30-day window as too-far-ahead, taking precedence over the weekend reason (US-005/AC-02, US-005/AC-04, US-005/D-05)', () => {
    // today + 30 is 2026-10-16 (a Friday); a window starting 2026-10-14 renders through
    // 2026-10-20, so 2026-10-17 (Saturday) is both a weekend AND beyond the window.
    render(
      <DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} windowStart="2026-10-14" />,
    );

    const saturdayBeyondWindow = screen.getByRole('radio', { name: /Sat 17/ });
    expect(saturdayBeyondWindow).toHaveTextContent('Too far ahead');
    expect(saturdayBeyondWindow).not.toHaveTextContent('Closed');
  });

  it('does not call onSelectDate for a refused day', async () => {
    const onSelectDate = vi.fn();
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={onSelectDate} />);

    await userEvent.click(screen.getByRole('radio', { name: /Sat 19/ }));

    expect(onSelectDate).not.toHaveBeenCalled();
  });

  it('calls onSelectDate with the date when a bookable chip is clicked', async () => {
    const onSelectDate = vi.fn();
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={onSelectDate} />);

    await userEvent.click(screen.getByRole('radio', { name: /Thu 17/ }));

    expect(onSelectDate).toHaveBeenCalledWith('2026-09-17');
  });

  it('is one tab stop: only the selected chip is in the tab order (US-005 interaction/accessibility, US-033/AC-07)', () => {
    render(<DateStrip today={TODAY} selectedDate="2026-09-17" onSelectDate={() => undefined} />);

    expect(screen.getByRole('radio', { name: /Thu 17/ })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: /Wed 16/ })).toHaveAttribute('tabindex', '-1');
  });

  it('ArrowRight moves the roving tab stop to the next bookable day, skipping a refused one (US-033/AC-07)', async () => {
    const user = userEvent.setup();
    render(<DateStrip today={TODAY} selectedDate="2026-09-18" onSelectDate={() => undefined} />);

    screen.getByRole('radio', { name: /Fri 18/ }).focus();
    await user.keyboard('{ArrowRight}');

    // Sat 19 and Sun 20 are both refused (weekend); the roving focus should land on Mon 21.
    expect(screen.getByRole('radio', { name: /Mon 21/ })).toHaveFocus();
  });

  it('a refused day stays in the accessibility tree, readable with its reason, even though arrow navigation skips it', () => {
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    // aria-disabled (not the native disabled attribute) keeps it perceivable to assistive tech
    // browsing outside the roving tab stop, per SCR-003's interaction notes.
    const saturday = screen.getByRole('radio', { name: /Sat 19/ });
    expect(saturday).not.toHaveAttribute('disabled');
    expect(saturday).toHaveAttribute('aria-disabled', 'true');
  });

  it('the radio group is labelled so a screen reader announces its purpose', () => {
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    expect(screen.getByRole('radiogroup', { name: 'Choose a date' })).toBeInTheDocument();
  });

  it('offers a "Pick another date" control that opens the full calendar', async () => {
    const onOpenPicker = vi.fn();
    render(
      <DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} onOpenPicker={onOpenPicker} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Pick another date' }));

    expect(onOpenPicker).toHaveBeenCalled();
  });

  it('disables paging back before today — there is nothing earlier to show', () => {
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Earlier dates' })).toBeDisabled();
  });

  it('paging forward advances the rolling window by one day, keeping the same interaction at every width', async () => {
    render(<DateStrip today={TODAY} selectedDate={TODAY} onSelectDate={() => undefined} />);

    await userEvent.click(screen.getByRole('button', { name: 'Later dates' }));

    expect(screen.queryByRole('radio', { name: /Wed 16/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Wed 23/ })).toBeInTheDocument();
    // Paging back then reveals today again.
    expect(screen.getByRole('button', { name: 'Earlier dates' })).toBeEnabled();
  });
});

describe('DateStrip — chip count per width (US-033/AC-03)', () => {
  it('shows 3 chips at 360px, 5 from 768px, all 7 from 1280px (US-033/AC-03)', () => {
    // jsdom performs no layout, so the stylesheet is the honest proxy for the breakpoint (same
    // device Dialog.spec.tsx uses). All 7 chips always render; CSS is what hides the extra ones.
    const HERE = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(HERE, 'date-strip.css'), 'utf8');
    const defaultRules = css.split('@media')[0] ?? '';
    expect(defaultRules).toMatch(/\.date-strip__chip:nth-child\(n \+ 4\)\s*\{[^}]*display:\s*none/);

    const at768 = css.match(/@media \(min-width: 768px\) \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(at768).toMatch(/\.date-strip__chip:nth-child\(n \+ 4\)\s*\{[^}]*display:\s*flex/);
    expect(at768).toMatch(/\.date-strip__chip:nth-child\(n \+ 6\)\s*\{[^}]*display:\s*none/);

    const at1280 = css.match(/@media \(min-width: 1280px\) \{[\s\S]*\}/)?.[0] ?? '';
    expect(at1280).toMatch(/\.date-strip__chip:nth-child\(n \+ 6\)\s*\{[^}]*display:\s*flex/);
  });
});
