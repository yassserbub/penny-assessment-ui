import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

/**
 * Change Request Detail Component: renders line-item diffs, approval timeline,
 * financial totals, and permission-aware approval and rejection controls.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit, OnChanges {
	@Input() id!: string;
	@Output() crUpdated = new EventEmitter<void>();

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;

	rejectControl = new FormControl('', {
		nonNullable: true,
		validators: [Validators.required, (control) => (control.value.trim() ? null : { required: true })],
	});

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	ngOnChanges(changes: SimpleChanges): void {
		if (changes['id'] && !changes['id'].firstChange) {
			void this.load();
		}
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	/** Approval timeline, oldest-first. */
	get timeline(): TimelineEntry[] {
		const audit = this.detail?.audit ?? [];
		return [...audit].sort((a, b) => a.at.localeCompare(b.at));
	}

	/** Whether the current user may approve the loaded CR. */
	get canApprove(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	get canReject(): boolean {
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user);
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	get deltaPercentage(): string {
		if (!this.detail || this.detail.baselineTotal === 0) {
			return '0%';
		}
		const pct = ((this.detail.delta / this.detail.baselineTotal) * 100).toFixed(1);
		return this.detail.delta > 0 ? `+${pct}%` : `${pct}%`;
	}

	async approve(): Promise<void> {
		if (!this.canApprove || this.submitting) {
			return;
		}
		this.submitting = true;
		this.actionError = undefined;
		try {
			const now = new Date().toISOString();
			const updated = await this.api.approve(this.session.user, this.id, now);
			this.state = { status: 'loaded', data: updated };
			this.crUpdated.emit();
		} catch (err) {
			this.actionError = (err as Error).message;
		} finally {
			this.submitting = false;
		}
	}

	async reject(): Promise<void> {
		if (this.rejectControl.invalid) {
			this.rejectControl.markAsTouched();
			return;
		}
		if (!this.canReject || this.submitting) {
			return;
		}
		this.submitting = true;
		this.actionError = undefined;
		try {
			const now = new Date().toISOString();
			const reason = this.rejectControl.value.trim();
			const updated = await this.api.reject(this.session.user, this.id, now, reason);
			this.state = { status: 'loaded', data: updated };
			this.rejectControl.reset();
			this.crUpdated.emit();
		} catch (err) {
			this.actionError = (err as Error).message;
		} finally {
			this.submitting = false;
		}
	}
}
