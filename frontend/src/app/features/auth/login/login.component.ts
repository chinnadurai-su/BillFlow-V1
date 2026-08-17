// login.component.ts — Login screen: collects credentials and signs the user in.
import { Component } from '@angular/core';

@Component({
  selector: 'app-login',
  imports: [],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  // TODO:
  //  - Reactive form with email + password controls.
  //  - On submit call AuthService.login() -> POST /api/auth/login (Spec §6 Auth); receives JWT.
  //  - Redirect to /dashboard on success; show errors in the { success, message, errorCode } shape.
}
