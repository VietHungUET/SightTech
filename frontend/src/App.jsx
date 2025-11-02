import {
    createBrowserRouter,
    createRoutesFromElements,
    Route,
    RouterProvider,
    Outlet
} from "react-router-dom";
import Home from "./pages/Home.jsx";
import ObjectDetection from "./pages/ObjectDetection.jsx";
import MenuBar from "./components/MenuBar.jsx";

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
            <Route path="object" element={<ObjectDetection />} />
        </Route>
    )
);

export default function App() {
    return <RouterProvider router={router} />;
}
