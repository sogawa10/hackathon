import React, { useState, useEffect } from 'react';
import { VEGETABLES, TASK_TYPE_CLASS } from '../vegetables';
import './TaskCreateModal.css';

type TaskCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: (message?: string) => void;
};

type TaskType = '単語帳' | '問題集' | '過去問' | 'その他';


const TaskCreateModal: React.FC<TaskCreateModalProps> = ({ isOpen, onClose, onTaskCreated }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const getTodayString = () => {
    const mockDate = import.meta.env.VITE_MOCK_TODAY;
    const d = mockDate ? new Date(`${mockDate}T00:00:00+09:00`) : new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getNextWeekString = () => {
    const mockDate = import.meta.env.VITE_MOCK_TODAY;
    const d = mockDate ? new Date(`${mockDate}T00:00:00+09:00`) : new Date();
    d.setDate(d.getDate() + 7);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [taskType, setTaskType] = useState<TaskType>('問題集');
  const [taskTitle, setTaskTitle] = useState<string>('');
  const [totalCount, setTotalCount] = useState<number | ''>('');
  const [lapCount, setLapCount] = useState<number | ''>(1);
  const [startDate, setStartDate] = useState<string>(getTodayString());
  const [endDate, setEndDate] = useState<string>(getNextWeekString());

  const [createdTaskId, setCreatedTaskId] = useState<string | null>(null);
  const [assignedSize, setAssignedSize] = useState<'S' | 'M' | 'L' | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setTaskType('問題集');
      setTaskTitle('');
      setTotalCount('');
      setLapCount(1);
      setStartDate(getTodayString());
      setEndDate(getNextWeekString());
      setCreatedTaskId(null);
      setAssignedSize(null);
      setErrorMsg('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const validateDates = () => {
    if (!startDate || !endDate) return false;
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const diffDays = (end - start) / (1000 * 60 * 60 * 24) + 1;
    return diffDays >= 7;
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!validateDates()) {
      setErrorMsg('タスクの実施期間は1週間（7日）以上必要です！');
      return;
    }

    const parsedTotalCount = parseInt(String(totalCount), 10);
    if (isNaN(parsedTotalCount) || parsedTotalCount <= 0) {
      setErrorMsg('分量は1以上の数値を入力してください。');
      return;
    }
    const parsedLapCount = taskType === '単語帳' ? parseInt(String(lapCount), 10) : 1;

    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          task_type: taskType,
          task_title: taskTitle,
          total_count: parsedTotalCount,
          lap_count: isNaN(parsedLapCount) || parsedLapCount <= 0 ? 1 : parsedLapCount,
          start_date: startDate,
          end_date: endDate
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `サーバーエラー (${response.status})`);
      }
      
      const data = await response.json();
      
      setCreatedTaskId(data.task_id);
      setAssignedSize(data.size);
      setStep(2);

    } catch (err: any) {
      setErrorMsg(err.message || 'タスクの登録に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleVegetableSelect = async (vegetableName: string) => {
    if (!createdTaskId) return;

    setLoading(true);
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE_URL}/api/vegetable/${createdTaskId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ vegetable_name: vegetableName })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || '野菜の割り当てに失敗しました');
      }

      let msg = '';
      if (startDate === getTodayString()) {
        msg = `${vegetableName}の種を畑に植えました。\n今日のToDoから育て始めましょう。`;
      } else {
        msg = `${vegetableName}の種を畑に植えました。\n${startDate} から育て始めます。`;
      }

      if (onTaskCreated) onTaskCreated(msg);
      window.dispatchEvent(new CustomEvent('taskCreated', { detail: msg }));
      
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || '野菜の割り当てに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const getUnit = () => {
    switch (taskType) {
      case '問題集': return '問';
      case '単語帳': return '語';
      case '過去問': return '年分';
      default: return 'ページ';
    }
  };

  const getTitlePlaceholder = () => {
    switch (taskType) {
      case '問題集': return '例: 青チャート 数学ⅠA';
      case '単語帳': return '例: システム英単語';
      case '過去問': return '例: 同志社大 理工学部 学部個別 数学';
      default: return '例: 授業ノートを暗記する';
    }
  };

  const getAmountPlaceholder = () => {
    switch (taskType) {
      case '問題集': return '例: 50';
      case '単語帳': return '例: 200';
      case '過去問': return '例: 3';
      default: return '例: 20';
    }
  };

  const typeOptions: TaskType[] = ['問題集', '単語帳', '過去問', 'その他'];

  return (
    <div className="dialog-backdrop">
      <div className="dialog task-dialog" role="dialog" aria-modal="true" aria-labelledby="task-dialog-title">

        {step === 1 && (
          <>
            <button type="button" className="dialog-close" onClick={onClose} aria-label="閉じる">×</button>
            <h2 id="task-dialog-title" className="dialog-title">新しいタスクを植える</h2>
            <form onSubmit={handleTaskSubmit} className="task-form">
              <fieldset className="task-type-picker">
                <legend className="field-label">教材の種類</legend>
                <div className="task-type-options">
                  {typeOptions.map((type) => (
                    <label key={type} className={`task-type-option ${TASK_TYPE_CLASS[type]}`}>
                      <input
                        type="radio"
                        name="task-type"
                        value={type}
                        checked={taskType === type}
                        onChange={() => setTaskType(type)}
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="task-title" className="field-label">タスク名</label>
                <input
                  id="task-title"
                  className="field-input"
                  type="text" required
                  value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={getTitlePlaceholder()}
                />
              </div>

              <div className="task-form-row">
                <div>
                  <label htmlFor="task-total" className="field-label">分量（{getUnit()}）</label>
                  <input
                    id="task-total"
                    className="field-input"
                    type="number" required min="1" inputMode="numeric"
                    value={totalCount}
                    onChange={(e) => setTotalCount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={getAmountPlaceholder()}
                  />
                </div>

                {taskType === '単語帳' && (
                  <div>
                    <label htmlFor="task-laps" className="field-label">周回数</label>
                    <input
                      id="task-laps"
                      className="field-input"
                      type="number" required min="1" inputMode="numeric"
                      value={lapCount}
                      onChange={(e) => setLapCount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="例: 2"
                    />
                  </div>
                )}
              </div>

              <div className="task-form-row">
                <div>
                  <label htmlFor="task-start" className="field-label">開始日</label>
                  <input
                    id="task-start"
                    className="field-input"
                    type="date" required
                    value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="task-end" className="field-label">期日</label>
                  <input
                    id="task-end"
                    className="field-input"
                    type="date" required
                    value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
              <p className="task-form-hint">期間は 7 日以上にしてください。最後の約 1 割は予備日になります。</p>

              {errorMsg && <p className="form-error" role="alert">{errorMsg}</p>}

              <button type="submit" disabled={loading} className="btn btn-primary task-submit">
                {loading ? '計算しています…' : '種を受け取る'}
              </button>
            </form>
          </>
        )}

        {step === 2 && assignedSize && (
          <>
            <h2 id="task-dialog-title" className="dialog-title">種が届きました</h2>
            <p className="task-seed-lead">
              分量と期間から、<strong>{assignedSize} サイズ</strong>の野菜が割り当てられました。育てたい種を選んでください。
            </p>

            <div className="seed-packets">
              {VEGETABLES[assignedSize].map(veg => (
                <button
                  type="button"
                  key={veg}
                  className={`seed-packet ${TASK_TYPE_CLASS[taskType]}`}
                  disabled={loading}
                  onClick={() => handleVegetableSelect(veg)}
                >
                  <span className="seed-packet-face">
                    <img src={`/野菜${assignedSize}/収穫_${veg}.png`} alt="" draggable={false} />
                  </span>
                  <span className="seed-packet-name">{veg}</span>
                </button>
              ))}
            </div>

            {errorMsg && <p className="form-error" role="alert">{errorMsg}</p>}
            {loading && <p className="task-form-hint">畑に植えています…</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default TaskCreateModal;
