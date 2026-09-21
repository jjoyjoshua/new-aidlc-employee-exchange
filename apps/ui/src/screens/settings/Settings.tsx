/**
 * SCR-004 — Settings (US-031). One switch, honestly presented: the browser push opt-in, plus
 * the employee's own read-only details. All eight states, confirmed against the real Figma
 * frames (`HF / SCR-004 · Settings`) rather than the written spec alone.
 *
 * The `usePushSettings` hook owns every state transition (design note §6); this file is a
 * thin renderer switching on its `st` discriminant, the same shape `MyBookings.tsx` gives
 * `useMyBookings`'s `status`.
 */
import { useMemo } from 'react';
import { Card } from '../../components/card/Card.js';
import { Toggle } from '../../components/toggle/Toggle.js';
import { NoteRow } from '../../components/note-row/NoteRow.js';
import { DefinitionList } from '../../components/definition-list/DefinitionList.js';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { SkeletonRow } from '../../components/skeleton-row/SkeletonRow.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { createFetchPushSettings, createOptIntoPush, createOptOutOfPush } from '../../lib/push-settings.js';
import { usePushSettings } from './use-push-settings.js';
import {
  BROWSER_ALERTS_DESCRIPTION,
  BROWSER_ALERTS_LABEL,
  LOAD_ERROR_NOTE,
  NOTIFICATIONS_HEADING,
  PERMISSION_DENIED_NOTE,
  REMINDERS_EMAIL_ONLY,
  ROLE_LABEL,
  SIGN_OUT,
  TRY_AGAIN,
  UNSUPPORTED_NOTE,
  WAITING_FOR_BROWSER,
  YOUR_DETAILS_HEADING,
  YOUR_DETAILS_OWNER_NOTE,
  changeFailedNote,
  emailPromise,
  stateLabel,
} from './copy.js';
import './settings.css';

export function Settings() {
  const { user, api, signOut } = useAuth();

  // Behind RequireSession, `user` is always present by the time this screen renders — the
  // same reasoning `MyBookings.tsx` states for `office`/`user`.
  if (!user) return null;

  return <SettingsContent email={user.email} fullName={user.fullName} role={user.role} api={api} signOut={signOut} />;
}

function SettingsContent({
  email,
  fullName,
  role,
  api,
  signOut,
}: {
  email: string;
  fullName: string;
  role: 'employee' | 'admin';
  api: ReturnType<typeof useAuth>['api'];
  signOut: () => Promise<void>;
}) {
  // Stable identities across renders (`MyBookings.tsx`'s own convention) — `usePushSettings`'s
  // `load` effect depends on these, and a fresh function every render would re-trigger it on
  // every render, resetting the state machine to ST-01 forever.
  const fetchPushSettings = useMemo(() => createFetchPushSettings(api), [api]);
  const optIntoPush = useMemo(() => createOptIntoPush(api), [api]);
  const optOutOfPush = useMemo(() => createOptOutOfPush(api), [api]);

  const push = usePushSettings({ fetchPushSettings, optIntoPush, optOutOfPush });

  return (
    <div className="settings">
      <div className="settings__header">
        <h1>Settings</h1>
      </div>

      {/* SCR-004's own accessibility note: a successful change announces the new state and
          the boundary, once — the same role="status" mechanism `MyBookings.tsx` uses. */}
      <div className="settings__visually-hidden" role="status">
        {push.st === 'ST-04' ? 'Browser alerts on. Reminders are email only.' : null}
        {push.st === 'ST-02' ? 'Browser alerts off.' : null}
      </div>

      <div className="settings__column">
        <section className="settings__section">
          <h2>{NOTIFICATIONS_HEADING}</h2>
          <Card>
            {push.st === 'ST-01' ? (
              <div className="settings__toggle-row">
                <span className="settings__toggle-copy">
                  <span className="settings__toggle-label">{BROWSER_ALERTS_LABEL}</span>
                  <span className="settings__toggle-description">{BROWSER_ALERTS_DESCRIPTION}</span>
                </span>
                <SkeletonRow />
              </div>
            ) : null}

            {push.st === 'ST-02' ? (
              <div className="settings__toggle-row">
                <span className="settings__toggle-copy">
                  <span className="settings__toggle-label">{BROWSER_ALERTS_LABEL}</span>
                  <span className="settings__toggle-description">{BROWSER_ALERTS_DESCRIPTION}</span>
                </span>
                <Toggle checked={false} label={stateLabel(false)} onChange={() => push.onToggleOn()} />
              </div>
            ) : null}

            {push.st === 'ST-03' ? (
              <div className="settings__toggle-row">
                <span className="settings__toggle-copy">
                  <span className="settings__toggle-label">{BROWSER_ALERTS_LABEL}</span>
                  <span className="settings__toggle-description">{WAITING_FOR_BROWSER}</span>
                </span>
                <Toggle checked={false} busy label={WAITING_FOR_BROWSER} onChange={() => {}} />
              </div>
            ) : null}

            {push.st === 'ST-04' ? (
              <div className="settings__toggle-row">
                <span className="settings__toggle-copy">
                  <span className="settings__toggle-label">{BROWSER_ALERTS_LABEL}</span>
                  <span className="settings__toggle-description">{BROWSER_ALERTS_DESCRIPTION}</span>
                  <span className="settings__toggle-boundary">{REMINDERS_EMAIL_ONLY}</span>
                </span>
                <Toggle checked={true} label={stateLabel(true)} onChange={() => push.onToggleOff()} />
              </div>
            ) : null}

            {push.st === 'ST-05' ? (
              <div className="settings__toggle-row settings__toggle-row--no-description">
                <span className="settings__toggle-copy">
                  <span className="settings__toggle-label">{BROWSER_ALERTS_LABEL}</span>
                </span>
                <Toggle checked={false} disabled label={stateLabel(false)} onChange={() => {}} />
              </div>
            ) : null}

            {push.st === 'ST-05' ? <NoteRow icon="block">{PERMISSION_DENIED_NOTE}</NoteRow> : null}

            {push.st === 'ST-06' ? (
              <div className="settings__toggle-row">
                <span className="settings__toggle-copy">
                  <span className="settings__toggle-label">{BROWSER_ALERTS_LABEL}</span>
                </span>
              </div>
            ) : null}
            {push.st === 'ST-06' ? <NoteRow icon="info-circle">{UNSUPPORTED_NOTE}</NoteRow> : null}

            {push.st === 'ST-07' ? (
              <>
                <Alert
                  actions={
                    <Button variant="secondary" onClick={push.retry}>
                      {TRY_AGAIN}
                    </Button>
                  }
                >
                  {changeFailedNote(push.direction)}
                </Alert>
                <div className="settings__toggle-row">
                  <span className="settings__toggle-copy">
                    <span className="settings__toggle-label">{BROWSER_ALERTS_LABEL}</span>
                    <span className="settings__toggle-description">{BROWSER_ALERTS_DESCRIPTION}</span>
                  </span>
                  {/* SCR-004's own keyboard note gives ST-07 THREE tab stops in the content
                      area — the toggle stays a live control, not a disabled one; clicking it
                      again re-attempts the same change `Try again` would. */}
                  <Toggle
                    checked={push.direction === 'opt-out'}
                    label={stateLabel(push.direction === 'opt-out')}
                    onChange={() => push.retry()}
                  />
                </div>
              </>
            ) : null}

            {push.st === 'ST-08' ? (
              <Alert
                actions={
                  <Button variant="secondary" onClick={push.retry}>
                    {TRY_AGAIN}
                  </Button>
                }
              >
                {LOAD_ERROR_NOTE}
              </Alert>
            ) : null}

            <NoteRow icon="mail">{emailPromise(email)}</NoteRow>
          </Card>
        </section>

        <section className="settings__section">
          <h2>{YOUR_DETAILS_HEADING}</h2>
          <Card>
            <DefinitionList
              items={[
                { label: 'Name', value: fullName },
                { label: 'Email', value: email },
                { label: 'Role', value: ROLE_LABEL[role] },
              ]}
            />
            <p className="settings__owner-note">{YOUR_DETAILS_OWNER_NOTE}</p>
          </Card>
        </section>

        <Button variant="secondary" onClick={() => void signOut()}>
          {SIGN_OUT}
        </Button>
      </div>
    </div>
  );
}
