import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CrListComponent } from './cr-list.component';
import { SessionService } from '../../session/session.service';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser): Promise<{ fixture: ComponentFixture<CrListComponent>; api: CrApiService }> {
	TestBed.configureTestingModule({
		imports: [CrListComponent],
		providers: [{ provide: SessionService, useValue: { user } }, CrApiService],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrListComponent);
	const api = TestBed.inject(CrApiService);
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded/empty state
	return { fixture, api };
}

describe('CrListComponent', () => {
	it('renders a row per change request in the user org', async () => {
		const { fixture } = await render(users.approver);
		expect(fixture.nativeElement.querySelectorAll('.cr-list__row').length).toBe(3); // org-alpha: CR-1, CR-2, CR-3
	});

	it('shows the empty state when the org has no change requests', async () => {
		const { fixture } = await render({ id: 'x', orgCode: 'org-empty', policies: ['cr_r_o'] });
		expect(fixture.nativeElement.querySelector('.cr-list__empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
	});

	it('filters visible rows by statusFilter accurately', async () => {
		const { fixture } = await render(users.approver);
		const selectEl: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');

		// Select PENDING_APPROVAL
		selectEl.value = 'PENDING_APPROVAL';
		selectEl.dispatchEvent(new Event('change'));
		fixture.detectChanges();

		const rows = fixture.nativeElement.querySelectorAll('.cr-list__row');
		expect(rows.length).toBe(1);
		expect(rows[0].textContent).toContain('CR-1');

		// Select DRAFT
		selectEl.value = 'DRAFT';
		selectEl.dispatchEvent(new Event('change'));
		fixture.detectChanges();

		const draftRows = fixture.nativeElement.querySelectorAll('.cr-list__row');
		expect(draftRows.length).toBe(1);
		expect(draftRows[0].textContent).toContain('CR-3');
	});

	it('renders filter-empty state when no change requests match the filter', async () => {
		const { fixture } = await render(users.approver);
		const selectEl: HTMLSelectElement = fixture.nativeElement.querySelector('.cr-list__filter');

		selectEl.value = 'REJECTED';
		selectEl.dispatchEvent(new Event('change'));
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-list__table')).toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__filter-empty')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__filter-empty').textContent).toContain('REJECTED');
	});

	it('emits select event with CR id when a row is clicked', async () => {
		const { fixture } = await render(users.approver);
		let selectedId: string | undefined;
		fixture.componentInstance.select.subscribe((id) => (selectedId = id));

		const firstRow: HTMLElement = fixture.nativeElement.querySelector('.cr-list__row');
		firstRow.click();

		expect(selectedId).toBe('CR-1');
	});

	it('renders error state when API fails and reloads on retry click', async () => {
		TestBed.configureTestingModule({
			imports: [CrListComponent],
			providers: [{ provide: SessionService, useValue: { user: users.approver } }, CrApiService],
		});
		await TestBed.compileComponents();
		const fixture = TestBed.createComponent(CrListComponent);
		const api = TestBed.inject(CrApiService);

		api.failNext = true;
		fixture.detectChanges(); // load()
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-list__error')).not.toBeNull();
		expect(fixture.nativeElement.querySelector('.cr-list__error').textContent).toContain('Network error');

		// Click retry
		const retryBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-list__error button');
		retryBtn.click();
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-list__table')).not.toBeNull();
	});
});
