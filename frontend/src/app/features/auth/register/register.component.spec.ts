import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../auth.service';
import { RegisterComponent } from './register.component';

const user: User = { _id: 'u1', name: 'Jane', email: 'jane@example.com', role: 'staff' };

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let authSpy: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(async () => {
    authSpy = jasmine.createSpyObj<AuthService>('AuthService', ['register', 'login']);

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    fixture.detectChanges();
  });

  it('creates', () => {
    expect(component).toBeTruthy();
  });

  it('starts with an invalid, empty form', () => {
    expect(component.form.invalid).toBeTrue();
  });

  it('rejects a too-short password and does not call register', () => {
    component.form.setValue({ name: 'Jane', email: 'jane@example.com', password: 'short' });
    component.submit();

    expect(authSpy.register).not.toHaveBeenCalled();
    expect(component.form.controls.password.invalid).toBeTrue();
  });

  it('registers, logs in, and navigates on success', () => {
    authSpy.register.and.returnValue(of(user));
    authSpy.login.and.returnValue(of(user));
    component.form.setValue({ name: 'Jane', email: 'jane@example.com', password: 'secret123' });

    component.submit();

    expect(authSpy.register).toHaveBeenCalledWith({
      name: 'Jane',
      email: 'jane@example.com',
      password: 'secret123',
    });
    expect(authSpy.login).toHaveBeenCalledWith({ email: 'jane@example.com', password: 'secret123' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(component.loading()).toBeFalse();
  });

  it('surfaces the error message when registration fails', () => {
    authSpy.register.and.returnValue(
      throwError(() => new AppError('An account with this email already exists.', 'EMAIL_TAKEN', 409)),
    );
    component.form.setValue({ name: 'Jane', email: 'jane@example.com', password: 'secret123' });

    component.submit();

    expect(component.errorMessage()).toBe('An account with this email already exists.');
    expect(authSpy.login).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
