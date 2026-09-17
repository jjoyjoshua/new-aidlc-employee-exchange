/**
 * Application root.
 *
 * Screens land here as stories deliver them, mapped to the approved specs SCR-001–SCR-010 with
 * the three responsive shells and their 360 / 768 / 1280 verification widths
 * (`inception/design/ia.md`, NFR-004).
 */
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth/auth-context.js';
import { AppRoutes } from './routes.js';

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
