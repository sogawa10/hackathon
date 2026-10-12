import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Login from './Login';
import Signup from './Signup';
import '../components/Header.css';
import './Landing.css';

const vegetables = [
  { name: 'プチトマト', size: 'S', left: '31.25%', top: '45.75%' },
  { name: 'なす', size: 'M', left: '50.25%', top: '45.75%' },
  { name: 'ブロッコリー', size: 'L', left: '69.5%', top: '45.75%' },
  { name: 'ネギ', size: 'S', left: '40.75%', top: '51.5%' },
  { name: 'かぼちゃ', size: 'L', left: '59.9%', top: '51.5%' },
];

export default function Landing() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = pathname === '/login' || pathname === '/signup';
  const isSignup = pathname === '/signup';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (isOpen && dialog && !dialog.open) dialog.showModal();
    if (!isOpen && dialog?.open) dialog.close();
  }, [isOpen]);

  return (
    <div className="landing">
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="VegeTASK トップページ">
          <span>VegeTASK</span>
        </Link>
        <nav className="landing-nav" aria-label="メインナビゲーション">
          <a className="landing-nav-about" href="#how-it-works">VegeTaskとは</a>
          <Link className="landing-login" to="/login">ログイン</Link>
          <Link className="landing-button compact" to="/signup">新規登録</Link>
        </nav>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">小さな積み重ねが、大きな実りに。</p>
            <h1>今日のがんばりを、<br /><span>育てよう。</span></h1>
            <p className="landing-description">勉強のタスクが、あなただけの野菜になる。<br />毎日の「できた」を育てて、<br className="mobile-break" />目標までの道のりを、もっと楽しく。</p>
            <dl className="landing-hero-details">
              <div><dt>やることは、今日の分だけ。</dt><dd>分量と期日から、毎日の学習量を自動で分割。</dd></div>
              <div><dt>続けた分だけ、畑がにぎやかに。</dt><dd>完了したタスクは野菜に。収穫が、がんばりの記録になります。</dd></div>
            </dl>
            <p className="landing-note">問題集も、単語帳も、毎日の学習も。</p>
          </div>
          <div className="landing-field-visual">
            <div className="landing-field-caption"><span aria-hidden="true">✦</span> あなたの努力が、実る場所。</div>
            <div className="landing-field">
              <img className="landing-field-base" src="/VegeTASK_畑.png" alt="学習の進み具合に合わせて野菜が育つ畑のイメージ" />
              {vegetables.map((vegetable) => <img key={vegetable.name} className="landing-crop" src={`/野菜${vegetable.size}/(8)_${vegetable.name}.png`} alt="" style={{ left: vegetable.left, top: vegetable.top }} />)}
            </div>
            <div className="landing-growth-note"><span aria-hidden="true">✓</span><div><strong>今日も、一歩前進。</strong><small>タスクを終えると、野菜が成長！</small></div></div>
          </div>
        </section>

        <section className="landing-preview" aria-label="学習管理画面の使用例">
          <div className="landing-preview-top"><span>MY GARDEN</span><span>画面イメージ</span></div>
          <div className="landing-preview-content"><div><p className="landing-eyebrow">毎日やることが、ひと目でわかる。</p><h2>大きな目標も、<br />今日の小さな一歩から。</h2><p>分量と期日を入力すると、タスクを毎日の学習量に分割。<br />「今日は何をしよう？」と迷う時間を減らします。</p></div>
            <div className="landing-demo-todo"><h3>今日のToDo <span>DEMO</span></h3><div><span className="demo-check">✓</span><p><strong>英語の単語帳</strong><small>今日の単語を覚える</small></p><span>🌱</span></div><div><span className="demo-check empty" /><p><strong>数学の問題集</strong><small>今日の問題を解く</small></p><span>🍅</span></div><p className="landing-demo-footnote">ひとつ終わるたびに、畑もあなたも育っていく。</p></div>
          </div>
        </section>

        <section id="how-it-works" className="landing-steps">
          <p className="landing-eyebrow">HOW IT WORKS</p><h2>いつもの勉強に、育てる楽しさを。</h2>
          <div className="landing-step-grid">
            {[
              { number: '01', title: '目標の種をまこう', text: '勉強したい内容と分量、期日を登録。毎日取り組む小さなタスクに分けられます。', image: '/野菜S/種_プチトマト.png' },
              { number: '02', title: '「できた」で育てよう', text: '今日のタスクを終えてチェックすると、野菜が成長。積み重ねが目に見えるから、続ける楽しみが生まれます。', image: '/野菜S/(5)_プチトマト.png' },
              { number: '03', title: '達成を収穫しよう', text: 'すべてのタスクを終えたら収穫。かごに並ぶ野菜が、あなたのがんばりの記録になります。', image: '/野菜S/収穫_プチトマト.png' },
            ].map((step) => <article key={step.number}><div className="landing-step-art"><span>{step.number}</span><img src={step.image} alt="" loading="lazy" /></div><h3>{step.title}</h3><p>{step.text}</p></article>)}
          </div>
        </section>

        <section className="landing-bottom-cta"><p className="landing-eyebrow">さあ、あなたの番です。</p><h2>次の「できた」が、<br />楽しみになる毎日へ。</h2><Link to="/signup" className="landing-button">VegeTaskをはじめる</Link></section>
      </main>
      <footer className="landing-footer"><p>毎日のがんばりを、実りに。</p><small>© {new Date().getFullYear()} VegeTask</small></footer>

      <dialog ref={dialogRef} className="landing-auth-dialog" aria-labelledby="auth-heading" onCancel={(event) => { event.preventDefault(); navigate('/'); }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) navigate('/'); } }}>
        <button className="landing-dialog-close" type="button" aria-label="閉じる" onClick={() => navigate('/')}>×</button>
        {isOpen && (isSignup ? <Signup key="signup" /> : <Login key="login" />)}
      </dialog>
    </div>
  );
}
