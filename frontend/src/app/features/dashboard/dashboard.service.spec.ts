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

  it('getSummary returns the summary payload', () => {
    let result: unknown;
    service.getSummary().subscribe((r) => (result = r));

    const req = httpMock.expectOne(`${base}/dashboard/summary`);
    expect(req.request.method).toBe('GET');
    const summary = { totalRevenue: 1000, outstanding: 200, overdueCount: 3 };
    req.flush({ success: true, data: summary });
    expect(result).toEqual(summary);
  });

  it('getRevenueTrend forwards the date range and returns the series', () => {
    let result: unknown;
    service.getRevenueTrend({ fromDate: '2026-01-01', toDate: '2026-06-01' }).subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === `${base}/dashboard/revenue-trend`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('fromDate')).toBe('2026-01-01');
    expect(req.request.params.get('toDate')).toBe('2026-06-01');
    const series = [
      { label: 'Jan', revenue: 100 },
      { label: 'Feb', revenue: 200 },
    ];
    req.flush({ success: true, data: series });
    expect(result).toEqual(series);
  });
});
