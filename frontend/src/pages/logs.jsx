import { useEffect, useMemo, useState } from 'react';
import { logAPI } from '../services/api';
import { showError } from '../services/swalService';

function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    loadLogs();
  }, []);

  const loadLogs = async () => {
    try {
      const res = await logAPI.getAll();
      setLogs(res.data || []);
    } catch (error) {
      console.error('Failed to load logs:', error);
      showError('Gagal memuat log aktivitas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadgeClass = (action) => {
    if (!action) return 'badge-warning';
    const normalized = action.toString().toLowerCase();
    if (normalized.includes('create') || normalized.includes('add') || normalized.includes('insert')) return 'badge-approved';
    if (normalized.includes('update') || normalized.includes('edit')) return 'badge-waiting';
    if (normalized.includes('delete') || normalized.includes('remove')) return 'badge-rejected';
    if (normalized.includes('approve') || normalized.includes('confirm')) return 'badge-approved';
    if (normalized.includes('reject') || normalized.includes('failed') || normalized.includes('error')) return 'badge-rejected';
    if (normalized.includes('login') || normalized.includes('logout')) return 'badge-available';
    return 'badge-pending';
  };

  const filteredLogs = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return logs;
    return logs.filter((log) => {
      const haystack = [
        log.action,
        log.aksi,
        log.table_affected,
        log.tabel_terkait,
        log.notes,
        log.keterangan,
        log.user_name,
        log.user_full_name,
        log.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [logs, query]);

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="card">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="card-header">Log Aktivitas</h1>
            <p className="card-body">Riwayat aksi admin dan sistem.</p>
          </div>
          <button className="btn btn-secondary" onClick={loadLogs}>
            Refresh
          </button>
        </div>
        <div className="form-group mt-2">
          <input
            type="text"
            className="form-input"
            placeholder="Cari aksi, user, atau keterangan..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">[]</div>
            <p>Belum ada log aktivitas.</p>
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Waktu</th>
                  <th>User</th>
                  <th>Aksi</th>
                  <th>Table</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const timestamp = log.created_at || log.waktu || log.timestamp;
                  const userName = log.user_full_name || log.full_name || log.user_name || log.name || '-';
                  const action = log.action || log.aksi || '-';
                  const table = log.table_affected || log.tabel_terkait || '-';
                  const detail = log.notes || log.keterangan || '-';
                  return (
                    <tr key={log.id}>
                      <td>{timestamp ? new Date(timestamp).toLocaleString('id-ID') : '-'}</td>
                      <td>{userName}</td>
                      <td>
                        <span className={`badge ${getActionBadgeClass(action)}`}>
                          {action}
                        </span>
                      </td>
                      <td>{table}</td>
                      <td>{detail}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default Logs;
