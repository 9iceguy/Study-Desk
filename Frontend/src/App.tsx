import {createBrowserRouter, RouterProvider} from 'react-router-dom';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import CanvasWorkspace from '@/screens/home';
import StudyWorkspace from '@/screens/study';

import '@/index.css';

const paths = [
    {
        path: '/',
        element: <StudyWorkspace />,
    },
    {
        path: '/canvas',
        element: <CanvasWorkspace />,
    },
];

const BrowserRouter = createBrowserRouter(paths);

const App = () => {
    return (
    <MantineProvider>
      <RouterProvider router={BrowserRouter}/>
    </MantineProvider>
    )
};

export default App;
