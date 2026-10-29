import { ColorSwatch, Group, Slider } from "@mantine/core";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import Draggable from "react-draggable";
import { Link } from "react-router-dom";
import { SWATCHES } from "@/constants";
import type { DraggableData, DraggableEvent } from "react-draggable";

interface GeneratedResult {
  expression: string;
  answer: string;
}

interface Response {
  expr: string;
  result: string | number;
  assign: boolean;
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8900";
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("rgb(255, 255, 255)");
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [reset, setReset] = useState(false);
  const [dictOfVars, setDictOfVars] = useState({});
  const [result, setResult] = useState<GeneratedResult>();
  const [latexPosition, setLatexPosition] = useState({ x: 10, y: 200 });
  const [latexExpression, setLatexExpression] = useState<Array<string>>([]);
  const [tool, setTool] = useState<
    "freehand" | "line" | "rect" | "circle" | "eraser"
  >("freehand");
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [history, setHistory] = useState<ImageData[]>([]);
  const [redoStack, setRedoStack] = useState<ImageData[]>([]);
  const [drawingName, setDrawingName] = useState("");
  const [savedDrawings, setSavedDrawings] = useState<{ [key: string]: string }>(
    {},
  );

  useEffect(() => {
    const drawings = JSON.parse(localStorage.getItem("savedDrawings") || "{}");
    setSavedDrawings(drawings);
  }, []);

  const loadDrawing = (name: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const image = new Image();
    image.src = savedDrawings[name];
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0);
    };
  };

  useEffect(() => {
    if (latexExpression.length > 0) {
      const mathJax = (
        window as Window & {
          MathJax?: { typesetPromise?: () => Promise<void> };
        }
      ).MathJax;
      void mathJax?.typesetPromise?.();
    }
  }, [latexExpression]);

  useEffect(() => {
    if (result) {
      renderLatexToCanvas(result.expression, result.answer);
    }
  }, [result]);

  useEffect(() => {
    if (reset) {
      resetCanvas();
      setLatexExpression([]);
      setResult(undefined);
      setDictOfVars({});
      setReset(false);
    }
  }, [reset]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
      }
    }

  }, []);

  const renderLatexToCanvas = (expression: string, answer: string) => {
    const latex = `\\(\\LARGE{${expression} = ${answer}}\\)`;
    setLatexExpression((prev) => [...prev, latex]);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { offsetX, offsetY } = e.nativeEvent;

    // Save history for undo
    setHistory((prev) => [
      ...prev,
      ctx.getImageData(0, 0, canvas.width, canvas.height),
    ]);
    setRedoStack([]); // clear redo on new action

    setStartPos({ x: offsetX, y: offsetY });
    setIsDrawing(true);

    if (tool === "freehand" || tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { offsetX, offsetY } = e.nativeEvent;

    if (tool === "freehand") {
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineTo(offsetX, offsetY);
      ctx.stroke();
    } else if (tool === "eraser") {
      ctx.strokeStyle = "black";
      ctx.lineWidth = strokeWidth;
      ctx.lineTo(offsetX, offsetY);
      ctx.stroke();
    } else {
      // Clear and redraw preview shapes
      ctx.putImageData(history[history.length - 1], 0, 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;

      const width = offsetX - startPos.x;
      const height = offsetY - startPos.y;

      switch (tool) {
        case "line":
          ctx.beginPath();
          ctx.moveTo(startPos.x, startPos.y);
          ctx.lineTo(offsetX, offsetY);
          ctx.stroke();
          break;
        case "rect":
          ctx.strokeRect(startPos.x, startPos.y, width, height);
          break;
        case "circle":
          ctx.beginPath();
          ctx.ellipse(
            startPos.x + width / 2,
            startPos.y + height / 2,
            Math.abs(width / 2),
            Math.abs(height / 2),
            0,
            0,
            2 * Math.PI,
          );
          ctx.stroke();
          break;
      }
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setStartPos(null);
  };

  const runRoute = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      const response = await axios.post(`${API_BASE_URL}/calculate`, {
        image: canvas.toDataURL("image/png"),
        dict_of_vars: dictOfVars,
      });

      const parsedData = Array.isArray(response.data?.data)
        ? response.data.data
        : [];

      parsedData.forEach((data: Response) => {
        if (data.assign === true) {
          setDictOfVars((prev) => ({
            ...prev,
            [data.expr]: data.result,
          }));
        }
      });

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let minX = canvas.width,
        minY = canvas.height,
        maxX = 0,
        maxY = 0;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (imageData.data[i + 3] > 0) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
      }

      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      setLatexPosition({ x: centerX, y: centerY });
      parsedData.forEach((data: Response) => {
        setTimeout(() => {
          setResult({
            expression: data.expr,
            answer: String(data.result),
          });
        }, 1000);
      });
    } catch (error) {
      console.error("Failed to process drawing", error);
    }
  };

  return (
    <>
      {/* Floating toolbar */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-[90%] max-w-5xl bg-white/10 backdrop-blur-md rounded-lg p-3 flex flex-wrap gap-2 items-center justify-center shadow-lg z-30">
        <Link
          to="/"
          className="inline-flex items-center rounded-md bg-white/20 px-3 py-2 text-sm text-white hover:bg-white/30"
        >
          Study Desk
        </Link>
        <Button
          onClick={() => setReset(true)}
          className="bg-white/20 text-white hover:bg-white/30"
          variant="default"
        >
          Reset
        </Button>

        <Group className="">
          {SWATCHES.map((swatch) => (
            <ColorSwatch
              key={swatch}
              color={swatch}
              onClick={() => setColor(swatch)}
              style={{
                cursor: "pointer",
                border: color === swatch ? "solid white" : undefined,
                scale: "75%",
                gap: "none",
              }}
            />
          ))}
        </Group>

        <Button
          onClick={runRoute}
          className="bg-green-600 hover:bg-green-700 text-white"
          variant="default"
        >
          Run
        </Button>

        {/* Stroke width slider */}
        <div className="flex flex-col items-center justify-center text-white">
          <span className="text-xs mb-1">Stroke</span>
          <Slider
            value={strokeWidth}
            onChange={setStrokeWidth}
            min={1}
            max={20}
            size="xs"
            color="white"
            styles={{
              track: { backgroundColor: "white" },
              thumb: { backgroundColor: "white", borderColor: "black" },
            }}
            w={100}
          />
        </div>
        <Button
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas || history.length === 0) return;
            const ctx = canvas.getContext("2d");
            const last = history.pop();
            if (last && ctx) {
              setRedoStack((prev) => [
                ...prev,
                ctx.getImageData(0, 0, canvas.width, canvas.height),
              ]);
              ctx.putImageData(last, 0, 0);
            }
          }}
          className="bg-yellow-600 hover:bg-yellow-700 text-white"
        >
          Undo
        </Button>

        <Button
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas || redoStack.length === 0) return;
            const ctx = canvas.getContext("2d");
            const redo = redoStack.pop();
            if (redo && ctx) {
              setHistory((prev) => [
                ...prev,
                ctx.getImageData(0, 0, canvas.width, canvas.height),
              ]);
              ctx.putImageData(redo, 0, 0);
            }
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          Redo
        </Button>
        <select
          title="Drawing tool"
          aria-label="Drawing tool"
          value={tool}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
            setTool(
              e.target.value as
                | "freehand"
                | "line"
                | "rect"
                | "circle"
                | "eraser",
            )
          }
          className="bg-black/10 text-white p-1 rounded"
        >
          <option value="freehand">Freehand</option>
          <option value="line">Line</option>
          <option value="rect">Rectangle</option>
          <option value="circle">Circle</option>
          <option value="eraser">Eraser</option>
        </select>
        <Button
          onClick={() => {
            const canvas = canvasRef.current;
            if (!canvas || !drawingName) return;
            const imageData = canvas.toDataURL("image/png");

            const savedDrawings = JSON.parse(
              localStorage.getItem("savedDrawings") || "{}",
            );
            savedDrawings[drawingName] = imageData;
            localStorage.setItem(
              "savedDrawings",
              JSON.stringify(savedDrawings),
            );

            alert("Saved drawing as: " + drawingName);
          }}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          Save
        </Button>

        <input
          type="text"
          placeholder="Name your drawing"
          value={drawingName}
          onChange={(e) => setDrawingName(e.target.value)}
          className="bg-white/10 text-white p-1 rounded"
        />
        {/* Drawing Preview List with Delete */}
        <div className="flex gap-4 flex-wrap text-white">
          {Object.entries(savedDrawings).map(([name, dataUrl]) => (
            <div key={name} className="flex flex-col items-center">
              <img
                src={dataUrl}
                alt={name}
                className="w-10 h-5 object-cover border border-white rounded cursor-pointer"
                onClick={() => loadDrawing(name)}
                title="Click to load"
              />
              <span className="text-xs">{name}</span>
              <Button
                onClick={() => {
                  const newDrawings = { ...savedDrawings };
                  delete newDrawings[name];
                  setSavedDrawings(newDrawings);
                  localStorage.setItem(
                    "savedDrawings",
                    JSON.stringify(newDrawings),
                  );
                }}
                className="bg-red-500 hover:bg-red-600 p-1 py- text-xs"
              >
                Delete
              </Button>
            </div>
          ))}
        </div>
        <Button
          onClick={() => {
            localStorage.removeItem("drawings");
            setSavedDrawings({});
          }}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          Clear Saved
        </Button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        id="canvas"
        className="absolute top-0 left-0 w-full h-full bg-black cursor-pointer"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseOut={stopDrawing}
      />

      {/* LaTeX expressions */}
      {latexExpression.map((latex, index) => (
        <Draggable
          key={index}
          defaultPosition={latexPosition}
          onStop={(_event: DraggableEvent, data: DraggableData) =>
            setLatexPosition({ x: data.x, y: data.y })
          }
        >
          <div className="absolute p-2 bg-white/10 backdrop-blur-md w-1/3   text-white rounded-lg shadow-md">
            <div className="latex-content overflow-x-scroll">{latex}</div>
          </div>
        </Draggable>
      ))}
    </>
  );
}
