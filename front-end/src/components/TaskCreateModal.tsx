import React, { useState, useEffect } from 'react';

type TaskCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;

  onTaskCreated?: (message?: string) => void;
};

type TaskType = '単語帳' | '問題集' | '過去問' | 'その他';

const VEGETABLES = {
  S: ['プチトマト', 'オクラ', '枝豆', 'シイタケ', 'ネギ'],
  M: ['赤パプリカ', 'ピーマン', 'なす', 'キュウリ', 'タケノコ'],
  L: ['キャベツ', 'かぼちゃ', 'トウモロコシ', 'ブロッコリー', 'カリフラワー']
};

const TaskCreateModal: React.FC<TaskCreateModalProps> = ({ isOpen, onClose, onTaskCreated }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const getTodayString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getNextWeekString = () => {
    const d = new Date();
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
        msg = `${vegetableName}の種を畑に植えました！🌱\nさっそく今日のToDoを進めて育てましょう！`;
      } else {
        msg = `${vegetableName}の種をゲットしました！🎁\n開始日の ${startDate} になったら自動的に畑に植えられます！`;
      }

      if (onTaskCreated) onTaskCreated(msg);
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
      case '問題集': return '例: 基本情報技術者試験 過去問';
      case '単語帳': return '例: シスタン';
      case '過去問': return '例: 同志社大 情報工学方式';
      default: return '例: React公式ドキュメント';
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

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 100000
    }}>
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', padding: '30px',
        width: '90%', maxWidth: '500px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
        position: 'relative',
        overflow: 'hidden'
      }}>
        
        <button 
          onClick={onClose}
          style={{
            position: 'absolute', top: '15px', right: '15px',
            background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#888'
          }}
        >×</button>

        {step === 1 && (
          <>
            <h2 style={{ textAlign: 'center', color: '#333', marginTop: 0 }}>🌱 新しいタスクを作る</h2>
            <form onSubmit={handleTaskSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>タスクの種類</label>
                <select 
                  value={taskType} 
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
                >
                  <option value="問題集">問題集</option>
                  <option value="単語帳">単語帳</option>
                  <option value="過去問">過去問</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>タスク名</label>
                <input 
                  type="text" required
                  value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={getTitlePlaceholder()}
                  style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>分量 ({getUnit()})</label>
                  <input 
                    type="number" required min="1"
                    value={totalCount} 
                    onChange={(e) => setTotalCount(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder={getAmountPlaceholder()}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>
                
                {taskType === '単語帳' && (
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>周回数</label>
                    <input 
                      type="number" required min="1"
                      value={lapCount} 
                      onChange={(e) => setLapCount(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="例: 2"
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>開始日</label>
                  <input 
                    type="date" required
                    value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>期日</label>
                  <input 
                    type="date" required
                    value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              {errorMsg && (
                <p style={{ color: '#d32f2f', fontWeight: 'bold', textAlign: 'center', margin: '5px 0' }}>{errorMsg}</p>
              )}

              <button 
                type="submit" 
                disabled={loading}
                style={{ 
                  marginTop: '10px', padding: '12px', borderRadius: '8px', border: 'none', 
                  backgroundColor: loading ? '#ccc' : '#4caf50', color: '#fff', fontWeight: 'bold', fontSize: '16px', cursor: loading ? 'default' : 'pointer'
                }}
              >
                {loading ? '計算中...' : 'タスクを確定して種をもらう'}
              </button>
            </form>
          </>
        )}

        {step === 2 && assignedSize && (
          <>
            <h2 style={{ textAlign: 'center', color: '#333', marginTop: 0 }}>🎁 種が届きました！</h2>
            <p style={{ textAlign: 'center', color: '#555' }}>
              あなたのタスクの難易度から、<strong>野菜{assignedSize}</strong> が割り当てられました。<br/>
              育てたい野菜の種を選んでください。
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '15px', marginTop: '20px' }}>
              {VEGETABLES[assignedSize].map(veg => (
                <div 
                  key={veg}
                  onClick={() => handleVegetableSelect(veg)}
                  style={{
                    padding: '15px', borderRadius: '12px', border: '2px solid #e0e0e0', cursor: 'pointer',
                    textAlign: 'center', width: '30%', transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#4caf50'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#e0e0e0'}
                >
                  <img 
                    src={`/野菜${assignedSize}/種_${veg}.png`} 
                    alt={`${veg}の種`} 
                    style={{ width: '50px', height: '50px', objectFit: 'contain', marginBottom: '10px' }} 
                  />
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{veg}</div>
                </div>
              ))}
            </div>

            {errorMsg && (
              <p style={{ color: '#d32f2f', fontWeight: 'bold', textAlign: 'center', marginTop: '15px' }}>{errorMsg}</p>
            )}

            {loading && <p style={{ textAlign: 'center', marginTop: '15px', color: '#888' }}>通信中...</p>}
          </>
        )}
      </div>
    </div>
  );
};

export default TaskCreateModal;