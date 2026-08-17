import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';

import { AppComponent } from './app.component';
import { AUTH_FEATURE_KEY, authReducer } from './store/auth.reducer';

describe('AppComponent', () => {
  let fixture: ComponentFixture<AppComponent>;
  let component: AppComponent;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideStore({ [AUTH_FEATURE_KEY]: authReducer }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => localStorage.clear());

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('does not render the shell when unauthenticated', () => {
    expect(component.isAuthenticated()).toBeFalse();
    expect(fixture.nativeElement.querySelector('.sidebar')).toBeNull();
  });
});
