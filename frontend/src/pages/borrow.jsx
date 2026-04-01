import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { borrowAPI, returnAPI, categoryAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { showSuccess, showError, showConfirm, showPrompt, showReturnConditionDialog } from '../services/swalService';

function Borrows() {
  const { isAdminOrPetugas, user } = useAuth();
  const [borrows, setBorrows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [isPrintReady, setIsPrintReady] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [activeTab, setActiveTab] = useState('table');
  const [batchRequests, setBatchRequests] = useState([]);
  const [adminBatches, setAdminBatches] = useState([]);
  const [expandedRequests, setExpandedRequests] = useState({});
  const [queueNotices, setQueueNotices] = useState([]);

  const POLL_INTERVAL_MS = 30000;

  useEffect(() => {
    loadBorrows();
  }, [filter]);

  useEffect(() => {
    // no category filter on borrow page for admin now: moved to Items page
  }, []);

  useEffect(() => {
    if (isPrinting && isPrintReady) {
      const timer = setTimeout(() => {
        window.print();
        setIsPrinting(false);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [isPrinting, isPrintReady]);

  useEffect(() => {
    if (isAdminOrPetugas()) {
      return;
    }

    const interval = setInterval(() => {
      loadBorrows();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isAdminOrPetugas]);

  const safeParse = (value) => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return null;
    } catch (error) {
      return null;
    }
  };

  const notifyQueuedPromotion = (rows) => {
    if (!user?.id) {
      return;
    }

    const cacheKey = `borrow_status_cache_${user.id}`;
    const previous = safeParse(localStorage.getItem(cacheKey)) || {};
    const current = {};

    rows.forEach((row) => {
      if (row && row.id != null) {
        current[row.id] = row.status;
      }
    });

    const hadPrevious = Object.keys(previous).length > 0;
    if (hadPrevious) {
      const promoted = rows.filter(
        (row) => row.status === 'pending' && previous[row.id] === 'queued'
      );
      if (promoted.length > 0) {
        setQueueNotices(
          promoted.map((row) => ({
            id: row.id,
            item_name: row.item_name,
            request_id: row.request_id,
          }))
        );
      } else {
        setQueueNotices([]);
      }
    } else {
      setQueueNotices([]);
    }

    localStorage.setItem(cacheKey, JSON.stringify(current));
  };

  const loadBorrows = async () => {
    try {
      let res;
      if (isAdminOrPetugas()) {
        if (filter === 'pending') {
          res = await borrowAPI.getPending();
        } else if (filter === 'active') {
          res = await borrowAPI.getActive();
        } else {
          res = await borrowAPI.getAll();
        }

        const batchRes = await borrowAPI.getBatches();
        setBorrows(res.data || []);
        setAdminBatches(sortBatchesByDate(batchRes.data || []));
      } else {
        const [myRes, requestRes] = await Promise.all([borrowAPI.getMy(), borrowAPI.getRequests()]);
        const myRows = myRes.data || [];
        setBorrows(myRows);
        setBatchRequests(sortBatchesByDate(requestRes.data || []));
        notifyQueuedPromotion(myRows);
      }
    } catch (error) {
      console.error('Failed to load borrows:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleApprove = async (id) => {
    const confirmed = await showConfirm({
      title: 'Approve Request',
      text: 'Approve this borrow request?',
      confirmButtonText: 'Yes, approve',
      cancelButtonText: 'Cancel',
      icon: 'question',
    });
    if (!confirmed) return;

    try {
      await borrowAPI.approve(id);
      loadBorrows();
      showSuccess('Borrow request approved!');
    } catch (error) {
      showError(error.message);
    }
  };

  const handleReject = async (id) => {
    const notes = await showPrompt({
      title: 'Reject Request',
      text: 'Reason for rejection:',
      inputLabel: 'Rejection reason',
      inputPlaceholder: 'Type a reason',
    });
    if (!notes) return;

    try {
      await borrowAPI.reject(id, notes);
      loadBorrows();
      showSuccess('Borrow request rejected!');
    } catch (error) {
      showError(error.message);
    }
  };

  const handleApproveBatch = async (requestId) => {
    const confirmed = await showConfirm({
      title: 'Approve Batch',
      text: `Approve batch request #${requestId}?`,
      confirmButtonText: 'Yes, approve',
      cancelButtonText: 'Cancel',
      icon: 'question',
    });
    if (!confirmed) return;

    try {
      await borrowAPI.approveBatch(requestId);
      await loadBorrows();
      showSuccess(`Batch request #${requestId} approved successfully!`);
    } catch (error) {
      showError(error.message);
    }
  };

  const handleRequestReturnBatch = async (requestId) => {
    const confirmed = await showConfirm({
      title: 'Request Return',
      text: 'Request to return this batch of borrows?',
      confirmButtonText: 'Yes, request',
      cancelButtonText: 'Cancel',
      icon: 'question',
    });
    if (!confirmed) return;

    try {
      await borrowAPI.requestReturnBatch(requestId);
      await loadBorrows();
      showSuccess('Batch return request submitted successfully!');
    } catch (error) {
      showError(error.message);
    }
  };

  const handleConfirmReturnBatchAdmin = async (batch) => {
    const waitingItems = (batch.items || []).filter((item) => item.borrow_status === 'waiting for return');
    if (waitingItems.length === 0) {
      showWarning('No return requests in this batch.');
      return;
    }

    const confirmed = await showConfirm({
      title: 'Confirm Returns',
      text: `Confirm return for ${waitingItems.length} item(s) in batch #${batch.request_id}?`,
      confirmButtonText: 'Yes, confirm',
      cancelButtonText: 'Cancel',
      icon: 'question',
    });
    if (!confirmed) {
      return;
    }

    try {
      const formValues = await showReturnConditionDialog({
        title: 'Confirm Returns',
        text: `Pilih kondisi untuk ${waitingItems.length} item yang dikembalikan.`,
        confirmButtonText: 'Confirm',
        cancelButtonText: 'Cancel',
      });
      if (!formValues) return;

      const results = await Promise.allSettled(
        waitingItems.map((item) => returnAPI.confirm(item.borrow_id, formValues))
      );
      const successCount = results.filter((result) => result.status === 'fulfilled').length;
      const failedCount = results.length - successCount;

      await loadBorrows();

      if (failedCount > 0) {
        showWarning(`Confirmed ${successCount} items. ${failedCount} failed.`);
      } else {
        showSuccess(`Batch #${batch.request_id} return confirmed successfully!`);
      }
    } catch (error) {
      showError(error.message);
    }
  };

  const handleConfirmReturn = async (id) => {
    const confirmed = await showConfirm({
      title: 'Confirm Return',
      text: 'Confirm return for this borrow?',
      confirmButtonText: 'Yes, confirm',
      cancelButtonText: 'Cancel',
      icon: 'question',
    });
    if (!confirmed) return;

    try {
      const formValues = await showReturnConditionDialog({
        title: 'Confirm Return',
        text: 'Pilih status barang dan catatan saat mengonfirmasi pengembalian',
        confirmButtonText: 'Confirm',
        cancelButtonText: 'Cancel',
      });
      if (!formValues) return;

      await returnAPI.confirm(id, formValues);
      loadBorrows();
      showSuccess('Return confirmed!');
    } catch (error) {
      showError(error.message);
    }
  };

  const toggleRequestDetails = (requestId) => {
    setExpandedRequests((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
  };

  const handlePrintReport = async () => {
    try {
      setIsPrintReady(false);
      setIsPrinting(true);
      const batchRes = await borrowAPI.getBatches();
      setAdminBatches(sortBatchesByDate(batchRes.data || []));
      setIsPrintReady(true);
    } catch (error) {
      setIsPrinting(false);
      showError(error.message);
    }
  };

  const sortBatchesByDate = (batches) => {
    return [...batches].sort((a, b) => {
      const timeA = new Date(a.submitted_at || 0).getTime();
      const timeB = new Date(b.submitted_at || 0).getTime();
      return timeB - timeA;
    });
  };

  const visibleBorrows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return borrows;

    return borrows.filter((borrow) => {
      const haystack = [
        borrow.id && String(borrow.id),
        borrow.full_name,
        borrow.nama_peminjam,
        borrow.item_name,
        borrow.category,
        borrow.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [borrows, query]);

  const visibleBatchRequests = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return batchRequests;

    return batchRequests.filter((request) => {
      const haystack = [
        request.request_id && String(request.request_id),
        request.request_status,
        request.borrower,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [batchRequests, query]);

  const visibleAdminBatches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return adminBatches;

    return adminBatches.filter((batch) => {
      const haystack = [
        batch.request_id && String(batch.request_id),
        batch.borrower,
        batch.request_status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(keyword);
    });
  }, [adminBatches, query]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  const formatDate = (dateValue) => {
    if (!dateValue) return '-';
    return new Date(dateValue).toLocaleDateString('id-ID');
  };

  const getOverdueDays = (expectedDate, actualReturnDate) => {
    if (!expectedDate || !actualReturnDate) {
      return 0;
    }

    const expected = new Date(expectedDate);
    const returned = new Date(actualReturnDate);

    if (Number.isNaN(expected.getTime()) || Number.isNaN(returned.getTime())) {
      return 0;
    }

    const diffDays = Math.floor((returned - expected) / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  const formatFine = (borrow) => {
    const baseFine = Number(borrow.fine ?? borrow.denda) || 0;
    let late = Number(borrow.late ?? borrow.terlambat_hari) || 0;

    if (late <= 0) {
      late = getOverdueDays(borrow.return_date_expected, borrow.return_date);
    }

    const fine = baseFine > 0 ? baseFine : late > 0 ? late * 5000 : 0;

    if (fine <= 0 && late <= 0) {
      return '-';
    }

    return `Rp ${fine.toLocaleString('id-ID')} (${late}d)`;
  };

  const queueNoticeText = queueNotices
    .map((notice) => `${notice.item_name} (#${notice.id})`)
    .join(', ');

  return (
    <div>
      <div className="card no-print">
        <div className="flex justify-between items-center">
          <h1 className="card-header">
            {isAdminOrPetugas() ? 'Borrow Requests Management' : 'My Borrows'}
          </h1>
          {!isAdminOrPetugas() && <div className="borrow-batch-badge">Cart Borrowing</div>}
        </div>

        <div className="form-group mt-3">
          <input
            type="text"
            className="form-input"
            placeholder="Cari borrow berdasarkan nama, item, atau status..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {isAdminOrPetugas() && (
          <div className="flex justify-between items-center mt-2">
            <div className="btn-group">
              <button
                className={`btn btn-sm ${filter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter('all')}
              >
                All
              </button>
              <button
                className={`btn btn-sm ${filter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter('pending')}
              >
                Pending
              </button>
              <button
                className={`btn btn-sm ${filter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter('active')}
              >
                Active
              </button>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={handlePrintReport} disabled={isPrinting}>
              {isPrinting ? 'Preparing...' : 'Print Borrow Report'}
            </button>
          </div>
        )}
      </div>

      {isAdminOrPetugas() && (
        <div className="card no-print">
          <div className="btn-group" style={{ margin: '1rem 0' }}>
            <button
              className={`btn btn-sm ${activeTab === 'table' ? 'btn-primary' : 'btn-secondary'}`}
              type="button"
              onClick={() => setActiveTab('table')}
            >
              Detail Item
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
              type="button"
              onClick={() => setActiveTab('batch')}
            >
              Riwayat Batch
            </button>
          </div>
        </div>
      )}

      {!isAdminOrPetugas() && (
        <div className="card no-print">
          {queueNotices.length > 0 && (
            <div className="alert alert-success">
              Stok tersedia untuk: {queueNoticeText}. Status sekarang pending dan menunggu persetujuan
              petugas.
            </div>
          )}
          <div className="flex justify-between items-center mb-2">
            <div>
              <h2 className="card-header">Riwayat Batch Peminjaman</h2>
              <p className="card-body">
                Ajukan peminjaman baru melalui halaman Items dan Cart.
              </p>
            </div>
            <div className="btn-group">
              <Link to="/items" className="btn btn-secondary">
                Browse Items
              </Link>
              <Link to="/cart" className="btn btn-primary">
                Go to Cart
              </Link>
            </div>
          </div>

          {visibleBatchRequests.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">[]</div>
              <p>No batch requests found</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Status</th>
                    <th>Submitted At</th>
                    <th>Total Items</th>
                    <th>Taken Items</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleBatchRequests.map((request) => {
                    const items = request.items || [];
                    const totalItems = items.length;
                    const takenItems = items.filter((i) => i.borrow_status === 'taken').length;
                    const isReturnAllowed = takenItems > 0;
                    const isExpanded = Boolean(expandedRequests[request.request_id]);

                    return (
                      <Fragment key={`batch-${request.request_id}`}>
                        <tr>
                          <td>#{request.request_id}</td>
                          <td>{request.request_status}</td>
                          <td>{new Date(request.submitted_at).toLocaleString('id-ID')}</td>
                          <td>{totalItems}</td>
                          <td>{takenItems}</td>
                          <td>
                            <div className="btn-group">
                              <button
                                className="btn btn-sm btn-warning"
                                onClick={() => handleRequestReturnBatch(request.request_id)}
                                disabled={!isReturnAllowed}
                              >
                                Request Return
                              </button>
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => toggleRequestDetails(request.request_id)}
                              >
                                {isExpanded ? 'Hide Detail' : 'View Detail'}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="table-row-details">
                            <td colSpan="6">
                              <div className="table-container">
                                <table className="table table-compact">
                                  <thead>
                                    <tr>
                                      <th>Item</th>
                                      <th>Qty</th>
                                      <th>Return Date</th>
                                      <th>Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((item) => (
                                      <tr key={`batch-detail-${request.request_id}-${item.borrow_id}`}>
                                        <td>{item.item_name}</td>
                                        <td>{item.item_count}</td>
                                        <td>{formatDate(item.return_date_expected)}</td>
                                        <td>{item.borrow_status}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isAdminOrPetugas() && activeTab === 'table' && (
        <div className="card no-print">
          {visibleBorrows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">[]</div>
              <p>No borrow requests found</p>
            </div>
          ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Borrower</th>
                  <th>Item</th>
                  <th>Category</th>
                  <th>Quantity</th>
                  <th>Borrow Date</th>
                  <th>Expected Return</th>
                  <th>Fine</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleBorrows.map((borrow) => (
                  <tr key={borrow.id}>
                    <td>#{borrow.id}</td>
                    <td>{borrow.full_name}</td>
                    <td>{borrow.item_name}</td>
                    <td>{borrow.category || '-'}</td>
                    <td>{borrow.item_count}</td>
                    <td>{new Date(borrow.borrow_date).toLocaleDateString()}</td>
                    <td>{new Date(borrow.return_date_expected).toLocaleDateString()}</td>
                    <td>{formatFine(borrow)}</td>
                    <td>
                      <span className={`badge badge-${borrow.status}`}>{borrow.status}</span>
                    </td>
                    <td>
                      <div className="btn-group">
                        {borrow.status === 'pending' && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => handleApprove(borrow.id)}>
                              Approve
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleReject(borrow.id)}>
                              Reject
                            </button>
                          </>
                        )}
                        {borrow.status === 'queued' && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleReject(borrow.id)}>
                            Reject
                          </button>
                        )}
                        {borrow.status === 'waiting for return' && (
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleConfirmReturn(borrow.id)}
                          >
                            Accept Return
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {isAdminOrPetugas() && activeTab === 'batch' && (
        <div className="card no-print">
          {visibleAdminBatches.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">[]</div>
              <p>No batch requests found</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>Borrower</th>
                    <th>Status</th>
                    <th>Submitted At</th>
                    <th>Total Items</th>
                    <th>Taken Items</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleAdminBatches.map((batch) => {
                    const totalItems = batch.items.length;
                    const takenItems = batch.items.filter((item) => item.borrow_status === 'taken').length;
                    const pendingItems = batch.items.filter((item) => item.borrow_status === 'pending').length;
                    const waitingReturnItems = batch.items.filter(
                      (item) => item.borrow_status === 'waiting for return'
                    ).length;

                    return (
                      <Fragment key={`batch-${batch.request_id}`}>
                        <tr>
                          <td>#{batch.request_id}</td>
                          <td>{batch.borrower}</td>
                          <td>{batch.request_status}</td>
                          <td>{new Date(batch.submitted_at).toLocaleString('id-ID')}</td>
                          <td>{totalItems}</td>
                          <td>{takenItems}</td>
                          <td>
                            <div className="btn-group">
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => handleApproveBatch(batch.request_id)}
                                disabled={pendingItems === 0}
                              >
                                Approve Batch
                              </button>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleConfirmReturnBatchAdmin(batch)}
                                disabled={waitingReturnItems === 0}
                              >
                                Confirm Return
                              </button>
                            </div>
                          </td>
                        </tr>
                        <tr>
                          <td colSpan="7">
                            <strong>Details:</strong>
                            <div className="table-container">
                              <table className="table table-compact">
                                <thead>
                                  <tr>
                                    <th>Item</th>
                                    <th>Qty</th>
                                    <th>Return</th>
                                    <th>Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {batch.items.map((item) => (
                                    <tr key={`batch-item-${item.borrow_id}`}>
                                      <td>{item.item_name}</td>
                                      <td>{item.item_count}</td>
                                      <td>{new Date(item.return_date_expected).toLocaleDateString()}</td>
                                      <td>{item.borrow_status}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isAdminOrPetugas() && (
        <section className="print-only">
          <div className="report-header">
            <div>
              <h2>Laporan Riwayat Batch Peminjaman</h2>
              <p className="report-meta">
                Dicetak oleh: {user?.full_name || user?.name || 'Petugas/Admin'}
              </p>
            </div>
            <div className="report-meta">Tanggal cetak: {new Date().toLocaleString('id-ID')}</div>
          </div>

          <p className="report-summary">Total batch: {adminBatches.length}</p>

          {adminBatches.map((batch) => (
            <div key={`print-batch-${batch.request_id}`} style={{ marginBottom: '1.5rem' }}>
              <h3>Batch #{batch.request_id} ({batch.request_status})</h3>
              <p>
                Peminjam: {batch.borrower} | Submit: {new Date(batch.submitted_at).toLocaleString('id-ID')}
              </p>
              <table className="table report-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Return</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.items.map((item) => (
                    <tr key={`print-batch-item-${item.borrow_id}`}>
                      <td>{item.item_name || '-'}</td>
                      <td>{item.item_count || 0}</td>
                      <td>{formatDate(item.return_date_expected)}</td>
                      <td>{item.borrow_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

    </div>
  );
}

export default Borrows;
