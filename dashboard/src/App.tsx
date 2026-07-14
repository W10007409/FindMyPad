import { Routes, Route } from 'react-router-dom';
import { RequireAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { LoginPage } from './auth/LoginPage';
import { SearchHome } from './pages/SearchHome';
import { DeviceDetail } from './pages/DeviceDetail';
import { StaleDevices } from './pages/StaleDevices';
import { ApMapManage } from './pages/ApMapManage';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<SearchHome />} />
          <Route path="/devices/:id" element={<DeviceDetail />} />
          <Route path="/stale" element={<StaleDevices />} />
          <Route path="/ap-map" element={<ApMapManage />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default function App() {
  return <AppRoutes />;
}
