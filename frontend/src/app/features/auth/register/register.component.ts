// register.component.ts — Registration screen: creates a new user account.
import { Component } from '@angular/core';

@Component({
  selector: 'app-register',
  imports: [],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  // TODO:
  //  - Reactive form for User fields (Spec §5.1): name, email, password, role.
  //  - On submit call AuthService.register() -> POST /api/auth/register (Spec §6 Auth).
  //  - Redirect to login (or auto-login) on success; surface validation errors.
}
