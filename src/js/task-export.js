// task-export.js - PDF/JSON Export & Import for GartenPlaner
// Extends GartenPlaner.prototype - must be loaded AFTER app.js defines the class.
// Do NOT add defer or async to script tags.

GartenPlaner.prototype.exportData = function () {
	try {
		const dataStr = JSON.stringify(this.tasks, null, 2);
		const dataBlob = new Blob([dataStr], { type: "application/json" });
		const url = URL.createObjectURL(dataBlob);
		const link = document.createElement("a");
		link.href = url;
		link.download = `gartenplaner_backup_${new Date().toISOString().split("T")[0]}.json`;
		link.click();
		URL.revokeObjectURL(url);
		this.showNotification("\ud83d\udcbe Daten exportiert!");
	} catch (error) {
		console.error("Fehler in exportData:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to export data: " + error.message,
				error: error,
				function: "exportData",
				context: { taskCount: this.tasks.length },
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim Exportieren der Daten. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.exportPDF = async function () {
	try {
		if (typeof window.jspdf === "undefined") {
			await this.showConfirm({
				title: "Fehler",
				icon: "\u274c",
				message:
					"PDF-Export ist nicht verf\u00fcgbar. Bitte laden Sie die Seite neu.",
				confirmText: "OK",
				cancelText: "",
				danger: false,
			});
			return;
		}
		const { jsPDF } = window.jspdf;
		const doc = new jsPDF();
		const tasksToExport = this.getFilteredTasks();
		if (tasksToExport.length === 0) {
			await this.showConfirm({
				title: "Keine Aufgaben",
				icon: "\u2139\ufe0f",
				message: "Keine Aufgaben zum Exportieren vorhanden.",
				confirmText: "OK",
				cancelText: "",
				danger: false,
			});
			return;
		}
		doc.setFontSize(20);
		doc.text("Gartenplaner - Aufgabenliste", 14, 20);
		doc.setFontSize(10);
		doc.text(`Erstellt am: ${new Date().toLocaleDateString("de-DE")}`, 14, 28);
		const pending = tasksToExport.filter((t) => t.status === "pending").length;
		const completed = tasksToExport.filter(
			(t) => t.status === "completed",
		).length;
		doc.text(
			`Gesamt: ${tasksToExport.length} | Offen: ${pending} | Erledigt: ${completed}`,
			14,
			34,
		);
		doc.setLineWidth(0.5);
		doc.line(14, 38, 196, 38);
		let yPosition = 46;
		const pageHeight = 280;
		const margin = 14;
		tasksToExport.forEach((task, index) => {
			if (yPosition > pageHeight - 40) {
				doc.addPage();
				yPosition = 20;
			}
			doc.setFontSize(12);
			doc.setFont(undefined, "bold");
			const statusIcon = task.status === "completed" ? "[\u2713]" : "[ ]";
			doc.text(`${statusIcon} ${index + 1}. ${task.title}`, margin, yPosition);
			yPosition += 7;
			doc.setFontSize(10);
			doc.setFont(undefined, "normal");
			doc.text(`Mitarbeiter: ${task.employee}`, margin + 5, yPosition);
			yPosition += 6;
			if (task.location) {
				doc.text(`Standort: ${task.location}`, margin + 5, yPosition);
				yPosition += 6;
			}
			doc.text(
				`Status: ${task.status === "pending" ? "Ausstehend" : "Erledigt"}`,
				margin + 5,
				yPosition,
			);
			yPosition += 6;
			if (task.description) {
				doc.text("Beschreibung:", margin + 5, yPosition);
				yPosition += 6;
				const maxWidth = 180;
				const lines = doc.splitTextToSize(task.description, maxWidth);
				lines.forEach((line) => {
					if (yPosition > pageHeight - 20) {
						doc.addPage();
						yPosition = 20;
					}
					doc.text(line, margin + 10, yPosition);
					yPosition += 5;
				});
			}
			if (task.createdAt) {
				const date = new Date(task.createdAt).toLocaleDateString("de-DE");
				doc.setFontSize(8);
				doc.setTextColor(128, 128, 128);
				doc.text(`Erstellt: ${date}`, margin + 5, yPosition);
				doc.setTextColor(0, 0, 0);
				yPosition += 6;
			}
			doc.setDrawColor(200, 200, 200);
			doc.line(margin, yPosition, 196, yPosition);
			yPosition += 10;
		});
		const pageCount = doc.internal.getNumberOfPages();
		for (let i = 1; i <= pageCount; i++) {
			doc.setPage(i);
			doc.setFontSize(8);
			doc.setTextColor(128, 128, 128);
			doc.text(`Seite ${i} von ${pageCount}`, 196, 290, { align: "right" });
		}
		const filename = `gartenplaner_aufgaben_${new Date().toISOString().split("T")[0]}.pdf`;
		doc.save(filename);
		this.showNotification("\ud83d\udcc4 PDF erfolgreich exportiert!");
	} catch (error) {
		console.error("Fehler in exportPDF:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to export PDF: " + error.message,
				error: error,
				function: "exportPDF",
				context: {},
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim PDF-Export. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};

GartenPlaner.prototype.importData = async function (event) {
	try {
		const file = event.target.files[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = async (e) => {
			try {
				const imported = JSON.parse(e.target.result);
				const confirmed = await this.showConfirm({
					title: "Daten importieren",
					icon: "\ud83d\udce5",
					message: `${imported.length} Aufgaben gefunden. M\u00f6chten Sie diese importieren?\n\nAchtung: Aktuelle Daten werden \u00fcberschrieben!`,
					confirmText: "Importieren",
					cancelText: "Abbrechen",
					danger: false,
				});
				if (confirmed) {
					const backup = JSON.parse(JSON.stringify(this.tasks));
					this.tasks = imported;
					await this.saveTasks();
					this.renderTasks();
					this.updateStatistics();
					this.updateEmployeeFilter();
					this.updateLocationFilter();
					this.showNotification("\ud83d\udce5 Daten erfolgreich importiert!");
				}
			} catch (error) {
				console.error("Fehler beim Parsen der Import-Datei:", error);
				if (window.errorBoundary) {
					window.errorBoundary.handleError({
						type: "runtime",
						message: "Failed to parse import file: " + error.message,
						error: error,
						function: "importData",
						context: { fileName: file.name },
						timestamp: new Date().toISOString(),
					});
				}
				await this.showConfirm({
					title: "Fehler",
					icon: "\u274c",
					message: "Fehler beim Importieren: Ung\u00fcltige Datei",
					confirmText: "OK",
					cancelText: "",
					danger: true,
				});
			}
		};
		reader.readAsText(file);
		event.target.value = "";
	} catch (error) {
		console.error("Fehler in importData:", error);
		if (window.errorBoundary) {
			window.errorBoundary.handleError({
				type: "runtime",
				message: "Failed to import data: " + error.message,
				error: error,
				function: "importData",
				context: {},
				timestamp: new Date().toISOString(),
			});
		}
		this.showNotification(
			"\u274c Fehler beim Importieren der Daten. Bitte versuchen Sie es erneut.",
			"error",
		);
	}
};
