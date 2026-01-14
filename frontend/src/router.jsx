import { createBrowserRouter } from 'react-router-dom';
import Layout from './components/layout/Layout';
import DashboardView from './components/dashboard/DashboardView';
import StacksView from './components/stacks/StacksView';
import StackDetailView from './components/stacks/StackDetailView';
import ContainersView from './components/containers/ContainersView';
import ContainerDetailView from './components/containers/ContainerDetailView';
import ImagesView from './components/images/ImagesView';
import NetworksView from './components/networks/NetworksView';
import VolumesView from './components/volumes/VolumesView';
import UpdatesView from './components/updates/UpdatesView';
import LogsView from './components/logs/LogsView';
import NotificationsView from './components/notifications/NotificationsView';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        index: true,
        element: <DashboardView />,
      },
      {
        path: 'stacks',
        element: <StacksView />,
      },
      {
        path: 'stacks/:name',
        element: <StackDetailView />,
      },
      {
        path: 'containers',
        element: <ContainersView />,
      },
      {
        path: 'containers/:id',
        element: <ContainerDetailView />,
      },
      {
        path: 'images',
        element: <ImagesView />,
      },
      {
        path: 'networks',
        element: <NetworksView />,
      },
      {
        path: 'volumes',
        element: <VolumesView />,
      },
      {
        path: 'updates',
        element: <UpdatesView />,
      },
      {
        path: 'logs',
        element: <LogsView />,
      },
      {
        path: 'notifications',
        element: <NotificationsView />,
      },
    ],
  },
]);
