import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { User, Lock, ArrowRight, Eye, EyeOff } from 'lucide-react';
import Antigravity from '../components/Antigravity';
import GlassSurface from '../components/GlassSurface';
import { Logo } from '../components/Logo';
import { useAuth } from '../contexts/AuthContext';

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const { login } = useAuth();
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        username: '',
        password: ''
    });

    const [error, setError] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await login(formData);
            navigate('/');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Giriş yapılamadı. Kullanıcı adı veya şifre hatalı.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-screen w-full relative overflow-hidden flex items-center justify-center bg-slate-900">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <Antigravity
                    count={500}
                    magnetRadius={10}
                    ringRadius={16}
                    waveSpeed={1.2}
                    waveAmplitude={1}
                    particleSize={2}
                    lerpSpeed={0.1}
                    color="#03518c"
                    autoAnimate
                    particleVariance={1}
                    rotationSpeed={0}
                    depthFactor={2.6}
                    pulseSpeed={3}
                    particleShape="capsule"
                    fieldStrength={23}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="relative z-10 w-full max-w-xl px-4"
            >
                <GlassSurface
                    borderRadius={32}
                    blur={40}
                    displace={20}
                    backgroundOpacity={0.1}
                    opacity={0.3}
                    saturation={1.4}
                    distortionScale={30}
                    borderWidth={1}
                    mixBlendMode="normal"
                    className="p-8 sm:p-12 shadow-2xl border-white/10"
                >
                    {/* Logo Section */}
                    <div className="flex flex-col items-center mb-10">
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="mb-6 p-4 rounded-3xl bg-white/5 border border-white/10 shadow-inner backdrop-blur-md"
                        >
                            <div className="w-32 text-white">
                                <Logo />
                            </div>
                        </motion.div>
                        <h1 className="text-3xl font-black text-white tracking-tight text-center mb-2">Hoş Geldiniz</h1>
                        <p className="text-slate-400 text-sm font-medium text-center">Teknokent Yönetim Sistemine Giriş Yapın</p>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleLogin} className="space-y-6">
                        {error && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-rose-500/10 border border-rose-500/20 text-rose-200 text-xs font-bold p-3 rounded-xl text-center"
                            >
                                {error}
                            </motion.div>
                        )}
                        <div className="space-y-4">
                            <div className="group">
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors">
                                        <User className="w-5 h-5" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        placeholder="Kullanıcı Adı"
                                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-500 font-bold outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-400 transition-colors">
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        required
                                        placeholder="Şifre"
                                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-2xl py-4 pl-12 pr-12 text-white placeholder-slate-500 font-bold outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 transition-all"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                    >
                                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-xs font-bold">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input type="checkbox" className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-offset-slate-900 focus:ring-indigo-500" />
                                <span className="text-slate-400 group-hover:text-slate-300 transition-colors">Beni Hatırla</span>
                            </label>
                            <a href="#" className="text-indigo-400 hover:text-indigo-300 transition-colors">Şifremi Unuttum?</a>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-black py-4 rounded-2xl shadow-lg shadow-indigo-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
                        >
                            {loading ? (
                                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    GİRİŞ YAP <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            © 2024 DijitalPark Teknokent
                        </p>
                    </div>
                </GlassSurface>
            </motion.div>
        </div>
    );
};
