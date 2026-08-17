import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../auth.service';
import { LoginComponent } from './login.component';

const user: User = { _id: 'u1', email: 'jane@example.com', role: 'staff' };

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let authSpy: jasmine.SpyObj<AuthService>;
  let router: Router;

  beforeEach(async () => {
    authSpy = jasmine.createSpyObj<AuthService>('AuthService', ['login']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authSpy },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
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

  it('rejects invalid input and does not call login', () => {
    component.form.setValue({ email: 'not-an-email', password: '' });
    component.submit();

    expect(authSpy.login).not.toHaveBeenCalled();
    expect(component.form.controls.email.invalid).toBeTrue();
  });

  it('calls login with the form value and navigates on success', () => {
    authSpy.login.and.returnValue(of(user));
    component.form.setValue({ email: 'jane@example.com', password: 'secret123' });

    component.submit();

    expect(authSpy.login).toHaveBeenCalledWith({ email: 'jane@example.com', password: 'secret123' });
    expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    expect(component.loading()).toBeFalse();
    expect(component.errorMessage()).toBeNull();
  });

  it('surfaces the error message on failure', () => {
    authSpy.login.and.returnValue(
      throwError(() => new AppError('Invalid email or password.', 'INVALID_CREDENTIALS', 401)),
    );
    component.form.setValue({ email: 'jane@example.com', password: 'secret123' });

    component.submit();

    expect(component.errorMessage()).toBe('Invalid email or password.');
    expect(component.loading()).toBeFalse();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
