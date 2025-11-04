import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
    RouterProvider,
    Outlet
} from "react-router-dom";
import Home from "./pages/Home.jsx";
import ImageDetection from "./pages/ImageDetection.jsx";
import MenuBar from "./components/MenuBar.jsx";
import MusicDetection from "./pages/MusicDetection.jsx";
import News from "./pages/News.jsx";
import ChatBot from "./pages/ChatBot.jsx";
import NotFound from "./pages/NotFound.jsx";

function Layout() {
    return (
        <>
            <MenuBar />
            <Outlet />
        </>
    );
}

const router = createBrowserRouter(
    createRoutesFromElements(
        <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="image" element={<ImageDetection />} />
            <Route path="music" element={<MusicDetection />} />
            <Route path="chatbot" element={<ChatBot />} />
            <Route path="news" element={<News />} />
            <Route path="*" element={<NotFound />} />
        </Route>
    )
);

export default function App() {
    return <RouterProvider router={router} />;
}
