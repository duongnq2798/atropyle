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

  it('names the route under the gate: the heirs, and when', () => {
    renderWithProviders(<Probe form={{ ...two, template: 'simple', guardians: [] }} />);
    const gate = screen.getByTestId('probe-gate');
    expect(gate).toHaveTextContent(/^Heirs after 194 days$/);
    // Hugs the gate's foot at any width: an offset in the box's own proportion, then 6 px.
    expect(gate.style.marginTop).toMatch(/^calc\(.*% \+ 4\.2% \+ 6px\)$/);
  });

  it('with guardians, says the gate needs them and when the heirs receive without them', () => {
    const form = { ...two, guardians: [PEOPLE.g1, PEOPLE.g2], k: '2' };
    renderWithProviders(<Probe form={form} />);
    const gate = screen.getByTestId('probe-gate');
    expect(gate).toHaveTextContent('Heirs after 194 days, if guardians confirm');
    expect(screen.getByTestId('probe-gate-fallback')).toHaveTextContent('otherwise after 15 months');
    expect(gate.style.marginTop).toContain('min(1.5rem, 8%)');
    expect(thread()?.getAttribute('aria-label')).toMatch(
      /your heirs can receive 194 days after it is created if your guardians confirm, otherwise after 15 months/,
    );
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
