// app.state.ts — Root NgRx state interface combining feature states.
//
// Only genuinely shared state lives here (Spec §7.5). Customer-list and invoice-list
// state deliberately stay as component-local Signals, not NgRx.
import { AuthState } from './auth.reducer';

export interface AppState {
  auth: AuthState;
}
