import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import Checkbox from '../../src/ui/components/Checkbox.svelte';
import Chip from '../../src/ui/components/Chip.svelte';
import JobCard from '../../src/ui/components/JobCard.svelte';
import Progress from '../../src/ui/components/Progress.svelte';
import Segmented from '../../src/ui/components/Segmented.svelte';
import Switch from '../../src/ui/components/Switch.svelte';
import type { JobSummary } from '../../src/lib/jobs/types';

function job(overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: 'job-1',
    title: 'Early access',
    subtitle: 'Histy',
    creator: { service: 'patreon', id: '1', name: 'Histy' },
    status: 'running',
    mode: 'zip',
    createdAt: 0,
    postCount: 1,
    stats: {
      total: 4,
      done: 1,
      failed: 1,
      skipped: 1,
      cancelled: 0,
      active: 1,
      bytes: 2_097_152,
      totalBytes: 4_194_304,
    },
    speed: 1_048_576,
    current: ['a.png'],
    ...overrides,
  };
}

describe('Checkbox', () => {
  it('toggles by click and keyboard', async () => {
    const onchange = vi.fn();
    render(Checkbox, { label: 'Pick me', onchange });
    const box = screen.getByRole('checkbox', { name: 'Pick me' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    await fireEvent.click(box);
    expect(box).toHaveAttribute('aria-checked', 'true');
    await fireEvent.keyDown(box, { key: ' ' });
    expect(box).toHaveAttribute('aria-checked', 'false');
    expect(onchange.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });

  it('shows the mixed state and respects disabled', async () => {
    const onchange = vi.fn();
    render(Checkbox, { label: 'Mixed', indeterminate: true, disabled: true, onchange });
    const box = screen.getByRole('checkbox', { name: 'Mixed' });
    expect(box).toHaveAttribute('aria-checked', 'mixed');
    await fireEvent.click(box);
    expect(onchange).not.toHaveBeenCalled();
  });
});

describe('Switch', () => {
  it('flips its state', async () => {
    const onchange = vi.fn();
    render(Switch, { label: 'Notifications', onchange });
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    await fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(onchange).toHaveBeenCalledWith(true);
  });
});

describe('Segmented', () => {
  it('selects options by click and arrow keys', async () => {
    const onchange = vi.fn();
    render(Segmented, {
      label: 'Mode',
      value: 'a',
      onchange,
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
      ],
    });
    await fireEvent.click(screen.getByRole('radio', { name: 'Beta' }));
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'true');
    const group = screen.getByRole('radiogroup', { name: 'Mode' });
    await fireEvent.keyDown(group, { key: 'ArrowRight' });
    await fireEvent.keyDown(group, { key: 'ArrowRight' });
    await fireEvent.keyDown(group, { key: 'ArrowLeft' });
    await fireEvent.keyDown(group, { key: 'Enter' });
    expect(onchange.mock.calls.map((c) => c[0])).toEqual(['b', 'c', 'a', 'c']);
  });
});

describe('Chip and Progress', () => {
  it('renders a pressed chip with a count', async () => {
    const onclick = vi.fn();
    render(Chip, { label: 'Images', count: 5, active: true, onclick });
    const chip = screen.getByRole('button', { name: /Images/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveTextContent('5');
    await fireEvent.click(chip);
    expect(onclick).toHaveBeenCalledOnce();
  });

  it('clamps progress values', () => {
    render(Progress, { value: 1.7, label: 'Loading' });
    expect(screen.getByRole('progressbar', { name: 'Loading' })).toHaveAttribute(
      'aria-valuenow',
      '100',
    );
  });
});

describe('JobCard', () => {
  it('summarises a running job', () => {
    render(JobCard, { job: job() });
    expect(screen.getByText('Early access')).toBeInTheDocument();
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument();
    expect(screen.getByText('1 failed')).toBeInTheDocument();
    expect(screen.getByText('1 skipped')).toBeInTheDocument();
    expect(screen.getByText('2.00 MB')).toBeInTheDocument();
    expect(screen.getByText('1.00 MB/s')).toBeInTheDocument();
    expect(screen.getByText('2s left')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('offers retry and remove for finished jobs, and sends the action', async () => {
    const send = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValue({ ok: true, data: null } as never);
    render(JobCard, { job: job({ status: 'done', finishedAt: 10 }) });
    expect(screen.getAllByText(/Completed with errors/).length).toBeGreaterThan(0);
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(send).toHaveBeenCalledWith({ type: 'jobs:action', jobId: 'job-1', action: 'retry' });
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pause' })).not.toBeInTheDocument();
  });

  it('shows scanning progress and friendly errors', () => {
    render(JobCard, {
      job: job({
        status: 'resolving',
        scan: { pages: 2, posts: 100, matched: 0 },
        error: 'nothing-found',
      }),
    });
    expect(screen.getByText('2 pages, 100 posts found')).toBeInTheDocument();
    expect(screen.getByText('No posts matched, so nothing was downloaded.')).toBeInTheDocument();
  });
});
