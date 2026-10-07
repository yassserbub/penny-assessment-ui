import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrStatus, CrSummary } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';

/**
 * Change Request List Component: loads and renders organization change requests
 * with real-time keyword search and status filtering.
 */
@Component({
	selector: 'app-cr-list',
	standalone: true,
	imports: [CommonModule],
	templateUrl: './cr-list.component.html',
})
export class CrListComponent implements OnInit {
	@Output() select = new EventEmitter<string>();

	state: ViewState<CrSummary[]> = idle();
	statusFilter: CrStatus | 'ALL' = 'ALL';
	readonly statuses: (CrStatus | 'ALL')[] = [
		'ALL',
		'DRAFT',
		'SUBMITTED',
		'PENDING_APPROVAL',
		'APPROVED',
		'APPLIED',
		'REJECTED',
		'CANCELLED',
	];

	searchTerm = '';

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	async load(): Promise<void> {
		this.state = loading();
		try {
			const rows = await this.api.listChangeRequests(this.session.user);
			this.state = { status: rows.length ? 'loaded' : 'empty', data: rows };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	onFilterChange(value: string): void {
		this.statusFilter = value as CrStatus | 'ALL';
	}

	onSearchChange(value: string): void {
		this.searchTerm = value;
	}

	/** Rows to render, after applying the active status filter and search term. */
	get visibleRows(): CrSummary[] {
		const rows = this.state.data ?? [];
		let filtered = rows;
		if (this.statusFilter !== 'ALL') {
			filtered = filtered.filter((r) => r.status === this.statusFilter);
		}
		if (this.searchTerm.trim()) {
			const term = this.searchTerm.toLowerCase().trim();
			filtered = filtered.filter((r) => r.title.toLowerCase().includes(term) || r.id.toLowerCase().includes(term));
		}
		return filtered;
	}
}
