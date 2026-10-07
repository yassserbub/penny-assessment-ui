import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimpleChange } from '@angular/core';
import { CrDetailComponent } from './cr-detail.component';
import { SessionService } from '../../session/session.service';
import { CrApiService } from '../../api/cr-api.service';
import { users } from '../../api/fixtures';
import { ReqUser } from '../../models/cr.models';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function render(user: ReqUser, id: string): Promise<{ fixture: ComponentFixture<CrDetailComponent>; api: CrApiService }> {
	TestBed.configureTestingModule({
		imports: [CrDetailComponent],
		providers: [{ provide: SessionService, useValue: { user } }, CrApiService],
	});
	await TestBed.compileComponents();
	const fixture = TestBed.createComponent(CrDetailComponent);
	const api = TestBed.inject(CrApiService);
	fixture.componentInstance.id = id;
	fixture.detectChanges(); // ngOnInit -> load()
	await flush(); // let the mock API resolve
	fixture.detectChanges(); // render the loaded state
	return { fixture, api };
}

describe('CrDetailComponent', () => {
	it('loads and renders the change request title', async () => {
		const { fixture } = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');
	});

	it('reloads data when input id changes via ngOnChanges', async () => {
		const { fixture } = await render(users.approver, 'CR-1');
		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Add 1 unit of SKU-A');

		fixture.componentInstance.id = 'CR-2';
		fixture.componentInstance.ngOnChanges({
			id: new SimpleChange('CR-1', 'CR-2', false),
		});
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		expect(fixture.nativeElement.querySelector('.cr-detail__header h2').textContent).toContain('Replace SKU-B supplier');
	});

	it('disables Approve for a read-only viewer on a pending CR', async () => {
		const { fixture } = await render(users.viewer, 'CR-1'); // viewer: cr_r_o only; CR-1 is PENDING_APPROVAL
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('renders approval timeline chronologically (oldest first)', async () => {
		const { fixture } = await render(users.approver, 'CR-1');
		const entries = fixture.nativeElement.querySelectorAll('.cr-timeline__entry');
		expect(entries.length).toBe(3);
		// Audit timestamps in CR-1: CREATE (09:00), SUBMIT (09:30), SEND_FOR_APPROVAL (10:00)
		expect(entries[0].querySelector('.cr-timeline__action').textContent).toBe('CREATE');
		expect(entries[1].querySelector('.cr-timeline__action').textContent).toBe('SUBMIT');
		expect(entries[2].querySelector('.cr-timeline__action').textContent).toBe('SEND_FOR_APPROVAL');
	});

	it('disables actions for a non-pending CR (e.g. APPLIED)', async () => {
		const { fixture } = await render(users.approver, 'CR-2'); // CR-2 is APPLIED
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(true);
		expect(fixture.nativeElement.querySelector('.cr-actions__reject')).toBeNull();
	});

	it('approves a pending CR when permitted and updates view state', async () => {
		const { fixture } = await render(users.approver, 'CR-1');
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		expect(approveBtn.disabled).toBe(false);

		let crUpdatedEmitted = false;
		fixture.componentInstance.crUpdated.subscribe(() => (crUpdatedEmitted = true));

		approveBtn.click();
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		// CR-1 status is now APPROVED
		const statusEl = fixture.nativeElement.querySelector('.cr-status');
		expect(statusEl.textContent).toBe('APPROVED');
		expect(crUpdatedEmitted).toBe(true);

		// Audit timeline updated with APPROVE entry
		const entries = fixture.nativeElement.querySelectorAll('.cr-timeline__entry');
		expect(entries[entries.length - 1].querySelector('.cr-timeline__action').textContent).toBe('APPROVE');
	});

	it('validates rejection reason and processes reject action', async () => {
		const { fixture } = await render(users.approver, 'CR-1');
		const rejectBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__reject-btn');
		const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('.cr-actions__reason');

		let crUpdatedEmitted = false;
		fixture.componentInstance.crUpdated.subscribe(() => (crUpdatedEmitted = true));

		// Initially disabled
		expect(rejectBtn.disabled).toBe(true);

		// Whitespace-only reason remains invalid
		textarea.value = '   ';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(true);

		// Valid reason
		textarea.value = 'Pricing exceeds budget limit';
		textarea.dispatchEvent(new Event('input'));
		fixture.detectChanges();
		expect(rejectBtn.disabled).toBe(false);

		// Click Reject
		rejectBtn.click();
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		// Status updated to REJECTED
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('REJECTED');
		expect(crUpdatedEmitted).toBe(true);

		// Audit timeline has REJECT entry with note
		const entries = fixture.nativeElement.querySelectorAll('.cr-timeline__entry');
		const lastEntry = entries[entries.length - 1];
		expect(lastEntry.querySelector('.cr-timeline__action').textContent).toBe('REJECT');
		expect(lastEntry.querySelector('.cr-timeline__note').textContent).toBe('Pricing exceeds budget limit');
	});

	it('handles network failure during action gracefully without breaking UI', async () => {
		const { fixture, api } = await render(users.approver, 'CR-1');
		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');

		api.failNext = true;
		approveBtn.click();
		fixture.detectChanges();
		await flush();
		fixture.detectChanges();

		const errorEl = fixture.nativeElement.querySelector('.cr-actions__error');
		expect(errorEl).not.toBeNull();
		expect(errorEl.textContent).toContain('Network error');
		expect(fixture.componentInstance.submitting).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('PENDING_APPROVAL');
	});

	it('prevents duplicate actions during slow network requests', async () => {
		const { fixture, api } = await render(users.approver, 'CR-1');
		api.latencyMs = 50;

		const approveBtn: HTMLButtonElement = fixture.nativeElement.querySelector('.cr-actions__approve');
		approveBtn.click();
		fixture.detectChanges();

		expect(fixture.componentInstance.submitting).toBe(true);
		expect(approveBtn.disabled).toBe(true);

		await new Promise((r) => setTimeout(r, 60));
		await flush();
		fixture.detectChanges();

		expect(fixture.componentInstance.submitting).toBe(false);
		expect(fixture.nativeElement.querySelector('.cr-status').textContent).toBe('APPROVED');
	});
});
