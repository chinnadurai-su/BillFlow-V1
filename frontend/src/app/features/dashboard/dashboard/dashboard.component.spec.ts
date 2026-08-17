import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { AppError } from '../../../core/models/api.model';
import { DashboardSummary, RevenueTrendPoint } from '../dashboard.models';
import { DashboardService } from '../dashboard.service';
import { DashboardComponent } from './dashboard.component';

const summary: DashboardSummary = { totalRevenue: 1000, outstanding: 200, overdueCount: 3 };
const trend: RevenueTrendPoint[] = [
  { label: 'Jan', revenue: 100 },
  { label: 'Feb', revenue: 200 },
];

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let serviceSpy: jasmine.SpyObj<DashboardService>;

  const setup = () => {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  beforeEach(() => {
    serviceSpy = jasmine.createSpyObj<DashboardService>('DashboardService', [
      'getSummary',
      'getRevenueTrend',
    ]);
    serviceSpy.getSummary.and.returnValue(of(summary));
    serviceSpy.getRevenueTrend.and.returnValue(of(trend));

    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [{ provide: DashboardService, useValue: serviceSpy }],
    });
  });

  it('creates and loads summary + trend on init', () => {
    setup();
    expect(component).toBeTruthy();
    expect(serviceSpy.getSummary).toHaveBeenCalled();
    expect(serviceSpy.getRevenueTrend).toHaveBeenCalled();
    expect(component.summary()).toEqual(summary);
    expect(component.revenueTrend()).toEqual(trend);
    expect(component.loading()).toBeFalse();
  });

  it('surfaces a user-readable error when loading fails', () => {
    serviceSpy.getSummary.and.returnValue(
      throwError(() => new AppError('Connection problem — please try again.', 'NETWORK_ERROR', 0, true)),
    );
    setup();

    expect(component.error()).toBe('Connection problem — please try again.');
    expect(component.loading()).toBeFalse();
  });
});
