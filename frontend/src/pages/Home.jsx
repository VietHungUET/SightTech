import {useEffect} from "react";
import {speech} from "../utils/utils.jsx";

export default function Home() {

    const introduction = "Welcome"

    useEffect(() => {
        speech(introduction);
    }, []);

    return <h1>{introduction}</h1>
}
