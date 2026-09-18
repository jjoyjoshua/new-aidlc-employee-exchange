/**
 * SCR-001 — Sign in. States ST-01 to ST-05.
 *
 * Built against `HF / SCR-001 · Sign in` at 1280 (`139:3`), 768 (`139:36`) and 360 (`139:395`),
 * plus the four state frames. Every value comes from a shared component or a token.
 *
 * **The copy lives here, keyed on the outcome, not on the server's `message`** (US-001/D-10).
 * ST-05 has no server message at all — a network failure produces no response — so the screen
 * must own copy regardless, and owning half of it in two places is the drift.
 */
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInRequestSchema } from '@desk-booking/contracts';
import { Alert } from '../../components/alert/Alert.js';
import { Button } from '../../components/button/Button.js';
import { Card } from '../../components/card/Card.js';
import { LoginBackdrop } from '../../components/login-backdrop/LoginBackdrop.js';
import { PasswordField } from '../../components/password-field/PasswordField.js';
import { TextField } from '../../components/text-field/TextField.js';
import { useAuth } from '../../lib/auth/auth-context.js';
import { landingPathFor } from '../../lib/auth/landing.js';
import './sign-in.css';

/** ST-04's copy. One sentence for all three causes — the screen never learns which it was. */
const REFUSED =
  "That email and password don't match an active account. If you think your account should be active, contact your office admin.";

/** ST-05's copy. The server cannot supply this: a network failure produces no response. */
const UNAVAILABLE = "We can't reach the booking service right now. Try again in a moment.";

type FormState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'refused' }
  | { kind: 'unavailable' };

interface FieldErrors {
  email?: string;
  password?: string;
}

export function SignIn() {
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<FormState>({ kind: 'idle' });

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const submitting = state.kind === 'submitting';

  async function attempt() {
    // Validated with the SAME schema object the route parses with — the concrete payoff of
    // ADR-002 on the very first story. Email is trimmed by the schema; the password never is.
    const parsed = signInRequestSchema.safeParse({ email, password });

    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === 'email' && !next.email) next.email = issue.message;
        if (field === 'password' && !next.password) next.password = issue.message;
      }
      setErrors(next);
      setState({ kind: 'idle' });
      // Focus moves to the FIRST field with an error (ST-02), in the fields' visual order.
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    setErrors({});
    setState({ kind: 'submitting' });

    // US-001/D-02 — normalise in our own code. The server does it too; doing it here as well
    // means what is sent matches what was matched.
    const result = await signIn(parsed.data.email.toLowerCase(), parsed.data.password);

    if (result.kind === 'ok') {
      // The role decides the landing screen, silently — REQ-004 gives each user exactly one
      // role, so a picker would offer a choice nobody has. An administrator-set password
      // outranks the role (US-004/AC-01): landingPathFor sends that case to /set-password
      // instead of either home.
      navigate(landingPathFor(result.user), { replace: true });
      return;
    }

    if (result.kind === 'rejected') {
      // ST-04: clear the password, keep the email, move focus to the password field. Keeping
      // the password would invite a second identical attempt.
      setPassword('');
      setState({ kind: 'refused' });
      passwordRef.current?.focus();
      return;
    }

    // ST-05: nothing the user typed is lost, and focus stays where it was — the alert is
    // announced without stealing it.
    setState({ kind: 'unavailable' });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    void attempt();
  }

  return (
    <main className="sign-in">
      <LoginBackdrop />

      <div className="sign-in__column">
        <header className="sign-in__lockup">
          <h1 className="sign-in__product">Desk Booking</h1>
          <p className="sign-in__strapline">Sign in to book a desk</p>
        </header>

        {/*
         * `noValidate` keeps `type="email"` for the mobile keyboard and password managers while
         * stopping the browser's native bubble from preempting the designed message and the
         * designed focus move (ST-02).
         */}
        <Card as="form" onSubmit={onSubmit} noValidate>
          {state.kind === 'refused' ? <Alert>{REFUSED}</Alert> : null}

          {state.kind === 'unavailable' ? (
            <Alert
              actions={
                <Button variant="secondary" onClick={() => void attempt()}>
                  Try again
                </Button>
              }
            >
              {UNAVAILABLE}
            </Alert>
          ) : null}

          <div className="sign-in__fields">
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              inputRef={emailRef}
              error={errors.email}
              readOnly={submitting}
              autoComplete="username"
              autoFocus
            />

            <PasswordField
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              inputRef={passwordRef}
              error={errors.password}
              readOnly={submitting}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" size="lg" block busy={submitting}>
            Sign in
          </Button>

          {/*
           * Static text, not a "Forgot password?" link. There is no self-service reset in this
           * release (BRD-001 §10), and a link that leads nowhere is worse than no link (PRIN-5).
           */}
          <p className="sign-in__help">Trouble signing in? Contact your office admin.</p>
        </Card>
      </div>
    </main>
  );
}
