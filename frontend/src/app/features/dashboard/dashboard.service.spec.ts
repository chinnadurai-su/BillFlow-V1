import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { DashboardService } from './dashboard.service';

const base = environment.apiUrl;

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getSummary maps the backend payload to the view model', () => {
    let result: unknown;
    service.getSummary().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${base}/dashboard/summary`);
    expect(req.request.method).toBe('GET');
    // Backend field names differ from the view model (totalOutstanding → outstanding).
    req.flush({
      success: true,
      data: { totalRevenue: 1000, totalOutstanding: 200, totalOverdue: 50, overdueCount: 3 },
    });
    expect(result).toEqual({ totalRevenue: 1000, outstanding: 200, overdueCount: 3 });
  });

  it('getRevenueTrend forwards the date range and maps { period, total } to { label, revenue }', () => {
    let result: unknown;
    service.getRevenueTrend({ fromDate: '2026-01-01', toDate: '2026-06-01' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === `${base}/dashboard/revenue-trend`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('fromDate')).toBe('2026-01-01');
    expect(req.request.params.get('toDate')).toBe('2026-06-01');
    // Backend returns { period, total }; the service maps to the chart's { label, revenue }.
    req.flush({
      success: true,
      data: [
        { period: '2026-01', total: 100 },
        { period: '2026-02', total: 200 },
      ],
    });
    expect(result).toEqual([
      { label: 'Jan 2026', revenue: 100 },
      { label: 'Feb 2026', revenue: 200 },
    ]);
  });
});
