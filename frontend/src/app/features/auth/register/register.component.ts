// register.component.ts — Registration screen: create an account, then sign in (Spec §6 Auth).
//
// The backend register endpoint returns the new user but no tokens, so on success we chain
// a login() with the same credentials for a smooth "register → dashboard" flow.
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    // Matches the backend rule (password must be at least 8 characters).
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.errorMessage.set(null);
    const { name, email, password } = this.form.getRawValue();

    this.auth
      .register({ name, email, password })
      .pipe(
        switchMap(() => this.auth.login({ email, password })),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.loading.set(false);
          void this.router.navigateByUrl('/dashboard');
        },
        error: (err: AppError) => {
          this.loading.set(false);
          this.errorMessage.set(err.message);
        },
      });
  }
}
