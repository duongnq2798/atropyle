import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PlanThread, usePreviewModel } from '../../src/app/create/preview';
import * as impl from '../../src/flows/impl';
import { renderWithProviders } from '../helpers/render';
import { PEOPLE } from './fixtures';

function Probe(p: { form: impl.CreateForm; vault?: `0x${string}` | null }) {
  const model = usePreviewModel(impl, p.form);
  return <PlanThread model={model} vault={p.vault ?? null} testId="probe" />;
}

const base = impl.initialForm(false);
const two = {
  ...base,
  heirs: [
    { account: PEOPLE.heirA, percent: '60' },
    { account: PEOPLE.heirB, percent: '40' },
  ],
};
const thread = () => screen.getByTestId('probe').querySelector('[data-thread]');

describe('loom preview', () => {
  it('one branch per heir, dashed, each in its heir colour', () => {
    const { container } = renderWithProviders(<Probe form={two} />);
    const branches = container.querySelectorAll('[data-part="branch"]');
    expect(branches).toHaveLength(2);
    expect(thread()).toHaveAttribute('data-predicted', 'true');
    expect(branches[0]).toHaveAttribute('data-tone', 'heir');
    expect(branches[1]?.getAttribute('class')).toContain('stroke-branch-2');
  });

  it('is an image with a name that says when the heirs can receive', () => {
    renderWithProviders(<Probe form={two} />);
    expect(thread()).toHaveAttribute('role', 'img');
    expect(thread()?.getAttribute('aria-label')).toMatch(/your heirs can receive 194 days after it is created/);
    expect(screen.getByText('Check in every 30 days')).toBeInTheDocument();
  });

  it('n posts at the gate, k of them needed, and an exit when recovery is on', () => {
    const form = { ...two, guardians: [PEOPLE.g1, PEOPLE.g2, PEOPLE.stranger], k: '2', recoveryEnabled: true };
    const { container } = renderWithProviders(<Probe form={form} />);
    expect(container.querySelectorAll('[data-part="post"]')).toHaveLength(3);
    expect(container.querySelector('[data-part="posts"]')).toHaveAttribute('data-k', '2');
    expect(container.querySelector('[data-part="exit"]')).not.toBeNull();
    expect(container.querySelector('[data-part="exit-end"]')).not.toBeNull();
  });

  it('no posts and no exit without guardians', () => {
    const { container } = renderWithProviders(<Probe form={{ ...two, template: 'simple', guardians: [] }} />);
    expect(container.querySelectorAll('[data-part="post"]')).toHaveLength(0);
    expect(container.querySelector('[data-part="exit"]')).toBeNull();
  });

  it('signs the thread with the vault once prepared', () => {
    renderWithProviders(<Probe form={two} />);
    expect(thread()).not.toHaveAttribute('data-signed');
    expect(screen.queryByTestId('probe-signed')).toBeNull();
  });

  it('carries the vault signature and says the heirs will see the same thread', () => {
    renderWithProviders(<Probe form={two} vault={PEOPLE.vault} />);
    expect(thread()).toHaveAttribute('data-signed', 'true');
    expect(screen.getByTestId('probe-signed')).toHaveTextContent("This is your vault's thread.");
  });
});
