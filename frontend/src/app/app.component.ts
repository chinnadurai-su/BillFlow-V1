// app.component.ts — Standalone root component; hosts the app shell + router outlet.
//
// The sidebar shell is shown only when authenticated; auth screens (login/register)
// render on their own. Nav state and logout are driven by AuthService.
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from './features/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly isAuthenticated = this.auth.isAuthenticated;
  readonly currentUser = this.auth.currentUser;

  logout(): void {
    this.auth.logout().subscribe(() => void this.router.navigate(['/auth/login']));
  }
}
